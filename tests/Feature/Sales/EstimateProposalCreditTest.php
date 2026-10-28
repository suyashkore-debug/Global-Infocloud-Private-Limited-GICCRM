<?php

use App\Enums\CreditNoteStatus;
use App\Enums\EstimateStatus;
use App\Enums\InvoiceStatus;
use App\Enums\ProposalStatus;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Services\EstimateService;
use App\Services\Options;

function lines(): array
{
    return [['description' => 'Consulting', 'qty' => 10, 'rate' => 100, 'taxes' => [['tax_name' => 'GST', 'tax_rate' => 18]]]];
}

it('creates a numbered estimate and converts it to an invoice, marking it accepted', function () {
    $admin = signIn(companyAdmin());
    Options::set('estimate_prefix', 'EST-');
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);

    $estimate = $this->postJson('/api/estimates', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines(), 'discount_type' => 'after_tax', 'discount_total' => 80])
        ->assertCreated()
        ->assertJsonPath('data.formatted_number', 'EST-000001')
        ->assertJsonPath('data.status', EstimateStatus::Draft->value)
        ->assertJsonPath('data.total', '1100.00')
        ->json('data');

    $this->postJson("/api/estimates/{$estimate['id']}/action", ['action' => 'mark_sent'])->assertJsonPath('data.status', EstimateStatus::Sent->value);

    $invoiceId = $this->postJson("/api/estimates/{$estimate['id']}/convert")->assertCreated()->assertJsonPath('data.total', '1100.00')->json('data.id');

    expect(Estimate::find($estimate['id']))->status->toBe(EstimateStatus::Accepted)->invoice_id->toBe($invoiceId)
        ->and(Invoice::find($invoiceId)->items()->count())->toBe(1);
    $this->postJson("/api/estimates/{$estimate['id']}/convert")->assertUnprocessable();
});

it('expires sent estimates past their expiry date', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $id = $this->postJson('/api/estimates', ['customer_id' => $customer->id, 'date' => today()->subDays(10)->toDateString(), 'expiry_date' => today()->subDay()->toDateString(), 'status' => 2, 'items' => lines()])->json('data.id');

    expect(app(EstimateService::class)->markExpired())->toBe(1)
        ->and(Estimate::find($id)->status)->toBe(EstimateStatus::Expired);
});

it('converts a proposal to an estimate and to an invoice only once', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Acme']);

    $proposal = $this->postJson('/api/proposals', ['subject' => 'Website build', 'content' => 'Scope...', 'customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines()])
        ->assertCreated()
        ->assertJsonPath('data.proposal_to', 'Acme')
        ->assertJsonPath('data.status', ProposalStatus::Draft->value)
        ->json('data');

    $this->postJson("/api/proposals/{$proposal['id']}/convert", ['to' => 'estimate'])->assertCreated()->assertJsonPath('type', 'estimate');
    $this->getJson("/api/proposals/{$proposal['id']}")->assertJsonPath('data.status', ProposalStatus::Accepted->value);
    $this->postJson("/api/proposals/{$proposal['id']}/convert", ['to' => 'invoice'])->assertUnprocessable();
});

it('allows a text-only proposal to a person who is not a customer yet', function () {
    signIn(companyAdmin());

    $this->postJson('/api/proposals', ['subject' => 'Intro', 'proposal_to' => 'Ravi Patil', 'email' => 'ravi@x.test', 'date' => today()->toDateString()])
        ->assertCreated()
        ->assertJsonPath('data.total', '0.00');
});

it('applies credit to an invoice (counting as payment) and closes when used up, refund included', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $invoice = Invoice::factory()->create(['customer_id' => $customer->id, 'total' => 1000]);

    $note = $this->postJson('/api/credit-notes', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => [['description' => 'Return', 'qty' => 1, 'rate' => 600]]])
        ->assertCreated()->assertJsonPath('data.formatted_number', 'CN-000001')->json('data');

    $this->getJson("/api/credit-notes/{$note['id']}/creditable-invoices")->assertJsonPath('data.0.id', $invoice->id);
    $this->postJson("/api/credit-notes/{$note['id']}/apply", ['credits' => [['invoice_id' => $invoice->id, 'amount' => 700]]])->assertUnprocessable();
    $this->postJson("/api/credit-notes/{$note['id']}/apply", ['credits' => [['invoice_id' => $invoice->id, 'amount' => 400]]])
        ->assertOk()->assertJsonPath('data.remaining_credits', 200);
    expect($invoice->refresh()->status)->toBe(InvoiceStatus::PartiallyPaid);

    $this->postJson("/api/credit-notes/{$note['id']}/refunds", ['amount' => 200, 'refunded_on' => today()->toDateString()])
        ->assertOk()->assertJsonPath('data.status', CreditNoteStatus::Closed->value);

    $this->getJson("/api/invoices/{$invoice->id}")->assertJsonPath('data.credits_applied', 400)->assertJsonPath('data.amount_due', 600);
    $this->postJson("/api/credit-notes/{$note['id']}/action", ['action' => 'void'])->assertUnprocessable();
});

it('refuses to apply credit to another customer\'s invoice', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $other = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id]);
    $note = $this->postJson('/api/credit-notes', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => [['description' => 'x', 'qty' => 1, 'rate' => 100]]])->json('data');

    $this->postJson("/api/credit-notes/{$note['id']}/apply", ['credits' => [['invoice_id' => $other->id, 'amount' => 50]]])
        ->assertUnprocessable()->assertJsonValidationErrors('invoice_id');
});

it('renders estimate, proposal and credit note PDFs', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $e = $this->postJson('/api/estimates', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines()])->json('data.id');
    $p = $this->postJson('/api/proposals', ['subject' => 'S', 'customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines()])->json('data.id');
    $c = $this->postJson('/api/credit-notes', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines()])->json('data.id');

    foreach (["/api/estimates/{$e}/pdf", "/api/proposals/{$p}/pdf", "/api/credit-notes/{$c}/pdf"] as $url) {
        expect($this->get($url)->assertOk()->headers->get('content-type'))->toBe('application/pdf');
    }
});

it('limits estimates to own ones with view_own', function () {
    $company = Company::factory()->create();
    $staff = staffMember($company, ['estimates.view_own', 'estimates.create']);
    $customer = Customer::factory()->create(['company_id' => $company->id]);

    signIn(companyAdmin($company));
    $this->postJson('/api/estimates', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines()])->assertCreated();

    signIn($staff);
    $mine = $this->postJson('/api/estimates', ['customer_id' => $customer->id, 'date' => today()->toDateString(), 'items' => lines()])->assertCreated()->json('data.id');
    $this->getJson('/api/estimates')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine);
});
