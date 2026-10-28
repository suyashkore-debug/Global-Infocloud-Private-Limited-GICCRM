<?php

use App\Enums\EstimateStatus;
use App\Enums\InvoiceStatus;
use App\Models\AppNotification;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Invoice;

it('shows an invoice to the customer without staff-only details', function () {
    $admin = signIn(companyAdmin());
    $invoice = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id, 'admin_note' => 'secret margin']);
    auth()->forgetGuards();

    $this->getJson("/api/public/documents/invoice/{$invoice->id}/{$invoice->hash}")->assertOk()
        ->assertJsonPath('data.document.formatted_number', $invoice->formattedNumber())
        ->assertJsonMissingPath('data.document.admin_note')->assertJsonMissingPath('data.document.can')
        ->assertJsonPath('data.actions.respond', false);
    $this->get("/api/public/documents/invoice/{$invoice->id}/{$invoice->hash}/pdf")->assertOk()->assertHeader('content-type', 'application/pdf');
    $this->getJson("/api/public/documents/invoice/{$invoice->id}/wrong")->assertNotFound();

    $invoice->update(['status' => InvoiceStatus::Draft]);
    $this->getJson("/api/public/documents/invoice/{$invoice->id}/{$invoice->hash}")->assertNotFound();
});

it('lets the customer accept an estimate once and tells the staff', function () {
    $admin = signIn(companyAdmin());
    $agent = staffMember($admin->company);
    $id = $this->postJson('/api/estimates', ['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id, 'date' => today()->toDateString(),
        'sale_agent_id' => $agent->id, 'status' => EstimateStatus::Sent->value, 'items' => [['description' => 'ERP', 'qty' => 1, 'rate' => 100]]])->json('data.id');
    $estimate = Estimate::find($id);
    auth()->forgetGuards();

    $url = "/api/public/documents/estimate/{$estimate->id}/{$estimate->hash}";
    $this->getJson($url)->assertJsonPath('data.actions.respond', true);
    $this->postJson("{$url}/respond", ['action' => 'accept'])->assertOk();
    expect($estimate->refresh()->status)->toBe(EstimateStatus::Accepted)
        ->and(AppNotification::where('user_id', $agent->id)->count())->toBe(1);
    $this->postJson("{$url}/respond", ['action' => 'decline'])->assertUnprocessable();
});

it('lets the customer sign a contract by name', function () {
    $admin = signIn(companyAdmin());
    $contract = Contract::create(['company_id' => $admin->company_id, 'subject' => 'AMC', 'customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id,
        'start_date' => '2027-01-01', 'hash' => str_repeat('b', 32), 'created_by' => $admin->id]);
    auth()->forgetGuards();

    $url = "/api/public/documents/contract/{$contract->id}/{$contract->hash}";
    $this->postJson("{$url}/respond", ['action' => 'sign'])->assertJsonValidationErrors('signer_name');
    $this->postJson("{$url}/respond", ['action' => 'sign', 'signer_name' => 'Ravi Kumar'])->assertOk();
    expect($contract->refresh()->signed)->toBeTrue()->and($contract->signer_name)->toBe('Ravi Kumar');
    $this->getJson($url)->assertJsonPath('data.actions.sign', false);
});
