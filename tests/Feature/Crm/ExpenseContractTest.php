<?php

use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Services\ContractService;
use App\Services\ExpenseService;

it('records a billable expense with tax and converts it to an invoice once', function () {
    $admin = signIn(companyAdmin());
    $category = $this->postJson('/api/setup/expense-categories', ['name' => 'Travel'])->assertCreated()->json('data.id');
    $tax = $this->postJson('/api/setup/taxes', ['name' => 'GST', 'rate' => 18])->json('data.id');
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);

    $expense = $this->postJson('/api/expenses', [
        'expense_category_id' => $category, 'name' => 'Flight', 'amount' => 1000, 'tax_id' => $tax,
        'date' => today()->toDateString(), 'customer_id' => $customer->id, 'billable' => true,
    ])->assertCreated()->assertJsonPath('data.total_with_tax', 1180)->json('data.id');

    $this->getJson('/api/expenses')->assertJsonPath('meta.summary.not_invoiced', 1180);

    $invoiceId = $this->postJson("/api/expenses/{$expense}/convert")->assertCreated()->assertJsonPath('data.total', '1180.00')->json('data.id');
    expect(Expense::find($expense)->invoice_id)->toBe($invoiceId)
        ->and(Invoice::find($invoiceId)->items()->first()->description)->toBe('Travel - Flight');
    $this->postJson("/api/expenses/{$expense}/convert")->assertUnprocessable();
});

it('does not invoice an expense without a customer', function () {
    $admin = signIn(companyAdmin());
    $category = ExpenseCategory::create(['company_id' => $admin->company_id, 'name' => 'Office']);
    $id = $this->postJson('/api/expenses', ['expense_category_id' => $category->id, 'amount' => 50, 'date' => today()->toDateString(), 'billable' => true])
        ->assertCreated()->assertJsonPath('data.billable', false)->json('data.id');

    $this->postJson("/api/expenses/{$id}/convert")->assertUnprocessable();
});

it('creates the next recurring expense', function () {
    $admin = signIn(companyAdmin());
    $category = ExpenseCategory::create(['company_id' => $admin->company_id, 'name' => 'Rent']);
    $id = $this->postJson('/api/expenses', ['expense_category_id' => $category->id, 'amount' => 20000, 'date' => today()->subMonth()->toDateString(), 'repeat_every' => 1, 'recurring_type' => 'month'])->json('data.id');

    expect(app(ExpenseService::class)->createRecurring())->toBe(1)
        ->and(Expense::where('recurring_from_id', $id)->first()->date->toDateString())->toBe(today()->toDateString());
});

it('renews a contract keeping the history and unsigning it', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $id = $this->postJson('/api/contracts', ['subject' => 'AMC', 'customer_id' => $customer->id, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'contract_value' => 50000])
        ->assertCreated()->json('data.id');

    $this->postJson("/api/contracts/{$id}/action", ['action' => 'sign'])->assertJsonPath('data.signed', true);
    $this->postJson("/api/contracts/{$id}/renew", ['new_start_date' => '2027-01-01', 'new_end_date' => '2027-12-31', 'new_value' => 55000])
        ->assertOk()
        ->assertJsonPath('data.contract_value', '55000.00')
        ->assertJsonPath('data.signed', false)
        ->assertJsonPath('data.renewals.0.old_value', '50000.00');
});

it('notifies the creator before a contract ends, once', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $this->postJson('/api/contracts', ['subject' => 'Support', 'customer_id' => $customer->id, 'start_date' => today()->subYear()->toDateString(), 'end_date' => today()->addDays(2)->toDateString()]);
    $this->postJson('/api/contracts', ['subject' => 'Later', 'customer_id' => $customer->id, 'start_date' => today()->toDateString(), 'end_date' => today()->addMonth()->toDateString()]);

    $service = app(ContractService::class);
    expect($service->notifyExpiring())->toBe(1)->and($service->notifyExpiring())->toBe(0)
        ->and(AppNotification::where('user_id', $admin->id)->value('description'))->toContain('Support');
});

it('shows the contracts summary and hides trashed ones', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $expired = $this->postJson('/api/contracts', ['subject' => 'Old', 'customer_id' => $customer->id, 'start_date' => '2024-01-01', 'end_date' => '2024-12-31'])->json('data.id');
    $this->postJson('/api/contracts', ['subject' => 'Now', 'customer_id' => $customer->id, 'start_date' => today()->toDateString()]);
    $this->postJson("/api/contracts/{$expired}/action", ['action' => 'trash']);

    $this->getJson('/api/contracts')->assertJsonCount(1, 'data')->assertJsonPath('meta.summary.trash', 1)->assertJsonPath('meta.summary.active', 1);
    $this->getJson('/api/contracts?filter=trash')->assertJsonPath('data.0.id', $expired);
});
