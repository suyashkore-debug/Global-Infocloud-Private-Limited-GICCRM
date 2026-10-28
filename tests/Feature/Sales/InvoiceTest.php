<?php

use App\Enums\InvoiceStatus;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Invoice;
use App\Services\InvoiceService;
use App\Services\Options;

function invoicePayload(Customer $customer, array $overrides = []): array
{
    return [
        'customer_id' => $customer->id,
        'date' => today()->toDateString(),
        'due_date' => today()->addDays(10)->toDateString(),
        'items' => [
            ['description' => 'Website design', 'hsn_code' => '998314', 'qty' => 2, 'rate' => 500, 'taxes' => [['tax_name' => 'CGST', 'tax_rate' => 9], ['tax_name' => 'SGST', 'tax_rate' => 9]]],
            ['description' => 'Hosting', 'qty' => 1, 'rate' => 1000],
        ],
        ...$overrides,
    ];
}

it('creates an invoice with the next number, server-side totals and the customer address', function () {
    $admin = signIn(companyAdmin());
    Options::set('invoice_prefix', 'GIC/25-26/');
    Options::set('next_invoice_number', '140');
    Options::set('number_padding_prefixes', '4');
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'billing_city' => 'Pune']);

    $this->postJson('/api/invoices', invoicePayload($customer, ['discount_type' => 'before_tax', 'discount_percent' => 10]))
        ->assertCreated()
        ->assertJsonPath('data.formatted_number', 'GIC/25-26/0140')
        ->assertJsonPath('data.status', InvoiceStatus::Unpaid->value)
        ->assertJsonPath('data.subtotal', '2000.00')
        ->assertJsonPath('data.total_tax', '162.00')
        ->assertJsonPath('data.total', '1962.00')
        ->assertJsonPath('data.billing.city', 'Pune')
        ->assertJsonPath('data.items.0.hsn_code', '998314');

    expect(Options::get('next_invoice_number'))->toBe('141');
});

it('gives a draft its number only when it is published', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);

    $id = $this->postJson('/api/invoices', invoicePayload($customer, ['save_as_draft' => true]))
        ->assertCreated()
        ->assertJsonPath('data.formatted_number', 'INV-DRAFT')
        ->json('data.id');
    expect(Options::get('next_invoice_number'))->toBe('1');

    $this->postJson("/api/invoices/{$id}/action", ['action' => 'publish'])
        ->assertOk()
        ->assertJsonPath('data.formatted_number', 'INV-000001')
        ->assertJsonPath('data.status', InvoiceStatus::Unpaid->value);
});

it('moves through partially paid to paid as payments are recorded, and back when one is deleted', function () {
    $admin = signIn(companyAdmin());
    $invoice = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id, 'total' => 1000]);

    $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 400, 'date' => today()->toDateString()])->assertCreated();
    expect($invoice->refresh()->status)->toBe(InvoiceStatus::PartiallyPaid);

    $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 700, 'date' => today()->toDateString()])
        ->assertUnprocessable()->assertJsonValidationErrors('amount');

    $last = $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 600, 'date' => today()->toDateString()])->assertCreated()->json('data.id');
    expect($invoice->refresh()->status)->toBe(InvoiceStatus::Paid);

    $this->deleteJson("/api/payments/{$last}")->assertOk();
    expect($invoice->refresh()->status)->toBe(InvoiceStatus::PartiallyPaid);
});

it('marks unpaid invoices past their due date as overdue', function () {
    $admin = signIn(companyAdmin());
    $invoice = Invoice::factory()->create([
        'customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id,
        'date' => today()->subDays(20), 'due_date' => today()->subDay(),
    ]);

    expect(app(InvoiceService::class)->markOverdue())->toBe(1)
        ->and($invoice->refresh()->status)->toBe(InvoiceStatus::Overdue);
});

it('cancels and uncancels an invoice', function () {
    $admin = signIn(companyAdmin());
    $invoice = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id]);

    $this->postJson("/api/invoices/{$invoice->id}/action", ['action' => 'cancel'])->assertJsonPath('data.status', InvoiceStatus::Cancelled->value);
    $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 10, 'date' => today()->toDateString()])->assertUnprocessable();
    $this->postJson("/api/invoices/{$invoice->id}/action", ['action' => 'uncancel'])->assertJsonPath('data.status', InvoiceStatus::Unpaid->value);
});

it('creates the next recurring invoice with its lines and the next number', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $id = $this->postJson('/api/invoices', invoicePayload($customer, [
        'date' => today()->subMonth()->toDateString(), 'due_date' => today()->subMonth()->addDays(5)->toDateString(),
        'repeat_every' => 1, 'recurring_type' => 'month',
    ]))->assertCreated()->json('data.id');

    expect(app(InvoiceService::class)->createRecurring())->toBe(1);

    $copy = Invoice::where('recurring_from_id', $id)->first();
    expect($copy->number)->toBe(2)
        ->and($copy->date->toDateString())->toBe(today()->toDateString())
        ->and($copy->items()->count())->toBe(2)
        ->and((float) $copy->total)->toBe((float) Invoice::find($id)->total);
});

it('downloads the invoice as a PDF', function () {
    $admin = signIn(companyAdmin());
    $id = $this->postJson('/api/invoices', invoicePayload(Customer::factory()->create(['company_id' => $admin->company_id])))->json('data.id');

    $response = $this->get("/api/invoices/{$id}/pdf");

    $response->assertOk();
    expect($response->headers->get('content-type'))->toBe('application/pdf');
});

it('lets staff with view_own see only their invoices', function () {
    $company = Company::factory()->create();
    $staff = staffMember($company, ['invoices.view_own']);
    $customer = Customer::factory()->create(['company_id' => $company->id]);
    $mine = Invoice::factory()->create(['customer_id' => $customer->id, 'sale_agent_id' => $staff->id]);
    $other = Invoice::factory()->create(['customer_id' => $customer->id]);

    signIn($staff);

    $this->getJson('/api/invoices')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);
    $this->getJson("/api/invoices/{$other->id}")->assertForbidden();
    $this->postJson('/api/invoices', invoicePayload($customer))->assertForbidden();
});

it('creates a customer with its primary contact, groups and GST details', function () {
    $admin = signIn(companyAdmin());
    $group = $this->postJson('/api/setup/customer-groups', ['name' => 'VIP'])->assertCreated()->json('data.id');

    $this->postJson('/api/customers', [
        'name' => 'Acme Pvt Ltd', 'vat' => '27AAGCG1483L1ZA', 'company_pan' => 'AAGCG1483L',
        'billing_city' => 'Mumbai', 'groups' => [$group], 'admins' => [$admin->id],
        'contact' => ['first_name' => 'Ravi', 'last_name' => 'Patil', 'email' => 'ravi@acme.test'],
    ])->assertCreated()
        ->assertJsonPath('data.primary_contact.email', 'ravi@acme.test')
        ->assertJsonPath('data.groups.0.name', 'VIP')
        ->assertJsonPath('data.company_pan', 'AAGCG1483L')
        ->assertJsonPath('data.billing.city', 'Mumbai');
});

it('gives the number back when the latest invoice is deleted', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $first = $this->postJson('/api/invoices', invoicePayload($customer))->json('data.id');
    $second = $this->postJson('/api/invoices', invoicePayload($customer))->json('data.id');

    $this->deleteJson("/api/invoices/{$first}")->assertOk();
    expect(Options::get('next_invoice_number'))->toBe('3');
    $this->deleteJson("/api/invoices/{$second}")->assertOk();
    expect(Options::get('next_invoice_number'))->toBe('2');
});
