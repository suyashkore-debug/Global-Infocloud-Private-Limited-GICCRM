<?php

use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;

it('reports invoices, payments and monthly income for the period', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Acme']);
    $invoice = Invoice::factory()->create(['customer_id' => $customer->id, 'total' => 1000, 'date' => '2026-03-10']);
    $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 400, 'date' => '2026-03-15'])->assertCreated();

    $this->getJson('/api/reports/sales?type=invoices&from=2026-03-01&to=2026-03-31')
        ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.customer', 'Acme')
        ->assertJsonPath('data.0.paid', 400)->assertJsonPath('data.0.due', 600);
    $this->getJson('/api/reports/sales?type=payments&from=2026-03-01&to=2026-03-31')->assertJsonPath('data.0.amount', 400);
    $this->getJson('/api/reports/sales?type=customers&from=2026-03-01&to=2026-03-31')->assertJsonPath('data.0.total_amount', 1000);
    $this->getJson('/api/reports/sales?type=invoices&from=2026-04-01&to=2026-04-30')->assertJsonCount(0, 'data');

    $this->getJson('/api/reports/sales-charts?year=2026')->assertJsonPath('data.total_income.2', 400)
        ->assertJsonPath('data.customer_groups.No group', 400);
    $this->getJson('/api/reports/expenses-vs-income?year=2026')->assertJsonPath('data.income.2', 400);
});

it('reports expenses per category and month including tax', function () {
    $admin = signIn(companyAdmin());
    $category = ExpenseCategory::create(['company_id' => $admin->company_id, 'name' => 'Travel']);
    Expense::create(['company_id' => $admin->company_id, 'expense_category_id' => $category->id, 'amount' => 500, 'date' => '2026-05-02', 'created_by' => $admin->id]);

    $this->getJson('/api/reports/expenses?year=2026')->assertOk()
        ->assertJsonPath('data.categories.0.category', 'Travel')
        ->assertJsonPath('data.categories.0.months.4', 500)
        ->assertJsonPath('data.totals.4', 500);
});

it('reports leads by source and conversions', function () {
    $admin = signIn(companyAdmin());
    $source = LeadSource::create(['company_id' => $admin->company_id, 'name' => 'Website']);
    $status = LeadStatus::create(['company_id' => $admin->company_id, 'name' => 'New', 'color' => '#000']);
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    foreach ([null, $customer->id] as $converted) {
        Lead::create(['company_id' => $admin->company_id, 'name' => 'L', 'lead_source_id' => $source->id, 'lead_status_id' => $status->id,
            'customer_id' => $converted, 'converted_at' => $converted ? now() : null, 'created_by' => $admin->id]);
    }

    $this->getJson('/api/reports/leads?year='.now()->year)->assertOk()
        ->assertJsonPath('data.sources.0.leads', 2)->assertJsonPath('data.sources.0.converted', 1)
        ->assertJsonPath('data.new.'.(now()->month - 1), 2);
});

it('needs the reports permission', function () {
    $admin = companyAdmin();
    signIn(staffMember($admin->company));
    $this->getJson('/api/reports/expenses')->assertForbidden();

    signIn(staffMember($admin->company, ['reports.view']));
    $this->getJson('/api/reports/expenses')->assertOk();
    $this->getJson('/api/reports/timesheets?from=2026-01-01&to=2026-12-31')->assertOk();
    $this->getJson('/api/reports/knowledge-base')->assertOk();
});
