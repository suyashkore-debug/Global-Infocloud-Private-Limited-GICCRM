<?php

use App\Models\AppNotification;
use App\Models\PurchaseInvoice;
use App\Models\Vendor;
use App\Services\Options;
use App\Services\PurchaseService;

function vendorFor(int $companyId): Vendor
{
    return Vendor::create(['company_id' => $companyId, 'name' => 'Office Mart', 'vendor_code' => 'V001', 'created_by' => 1]);
}

it('manages vendors with contacts', function () {
    signIn(companyAdmin());
    $category = $this->postJson('/api/setup/vendor-categories', ['name' => 'Office Supply'])->assertCreated()->json('data.id');
    $id = $this->postJson('/api/purchase/vendors', ['name' => 'Office Mart', 'vendor_code' => 'V001', 'category_ids' => [$category],
        'contact' => ['first_name' => 'Ravi', 'email' => 'ravi@mart.test']])->assertCreated()->json('data.id');

    $this->getJson('/api/purchase/vendors')->assertJsonPath('data.0.categories.0', 'Office Supply')->assertJsonPath('data.0.primary_contact.name', 'Ravi');
    $this->postJson('/api/purchase/vendors', ['name' => 'Dup', 'vendor_code' => 'V001'])->assertJsonValidationErrors('vendor_code');
    $contact = $this->postJson("/api/purchase/vendors/{$id}/contacts", ['first_name' => 'Asha', 'is_primary' => true])->assertOk()->json('data.contacts.0');
    expect($contact['first_name'])->toBe('Asha');
});

it('takes a purchase request through approval to an order, a bill and payment', function () {
    $admin = signIn(companyAdmin());
    $approver = staffMember($admin->company, ['purchase_requests.view']);
    $vendor = vendorFor($admin->company_id);
    $tax = $this->postJson('/api/setup/taxes', ['name' => 'GST', 'rate' => 18])->json('data.id');
    $this->postJson('/api/purchase/approval-settings', ['name' => 'PR approver', 'related' => 'pur_request', 'approver_ids' => [$approver->id]])->assertCreated();

    $pr = $this->postJson('/api/purchase/requests', ['name' => 'Laptops', 'items' => [['description' => 'Laptop', 'qty' => 2, 'unit_price' => 50000, 'tax_id' => $tax]]])
        ->assertCreated()->assertJsonPath('data.code', '#PR-00001')->assertJsonPath('data.total', 118000)->json('data.id');

    $this->postJson("/api/purchase/requests/{$pr}/action", ['action' => 'send_approval'])->assertOk()->assertJsonPath('data.approvals.0.staff_id', $approver->id);
    expect(AppNotification::where('user_id', $approver->id)->exists())->toBeTrue();
    $this->postJson("/api/purchase/requests/{$pr}/action", ['action' => 'to_order', 'vendor_id' => $vendor->id])->assertUnprocessable();

    signIn($approver);
    $this->getJson("/api/purchase/requests/{$pr}")->assertJsonPath('data.awaiting_my_decision', true);
    $this->postJson("/api/purchase/requests/{$pr}/action", ['action' => 'approve'])->assertJsonPath('data.status', PurchaseService::APPROVED);

    signIn($admin);
    $po = $this->postJson("/api/purchase/requests/{$pr}/action", ['action' => 'to_order', 'vendor_id' => $vendor->id])->assertCreated()->json('data.purchase_order_id');
    $order = $this->getJson("/api/purchase/orders/{$po}")->assertJsonPath('data.total', 118000)->assertJsonPath('data.request.id', $pr)->json('data');
    expect($order['code'])->toStartWith('#PO-00001');

    // No approval setting for orders: sending approves straight away.
    $this->postJson("/api/purchase/orders/{$po}/action", ['action' => 'send_approval'])->assertJsonPath('data.status', PurchaseService::APPROVED);
    $this->get("/api/purchase/orders/{$po}/pdf")->assertOk()->assertHeader('content-type', 'application/pdf');
    $bill = $this->postJson("/api/purchase/orders/{$po}/action", ['action' => 'to_invoice'])->assertCreated()->json('data.purchase_invoice_id');

    $this->getJson("/api/purchase/invoices/{$bill}")->assertJsonPath('data.invoice_number', 'BILL# 1')->assertJsonPath('data.amount_due', 118000);
    $this->postJson("/api/purchase/invoices/{$bill}/payments", ['amount' => 200000, 'date' => today()->toDateString()])->assertJsonValidationErrors('amount');
    $this->postJson("/api/purchase/invoices/{$bill}/payments", ['amount' => 18000, 'date' => today()->toDateString()])->assertCreated()->assertJsonPath('data.payment_status', 'partially_paid');
    $payment = $this->postJson("/api/purchase/invoices/{$bill}/payments", ['amount' => 100000, 'date' => today()->toDateString()])->assertJsonPath('data.payment_status', 'paid')->json('data.payments.1.id');
    $this->deleteJson("/api/purchase/invoices/{$bill}/payments/{$payment}")->assertJsonPath('data.payment_status', 'partially_paid');
    $this->deleteJson("/api/purchase/vendors/{$vendor->id}")->assertUnprocessable();
});

it('applies discount and shipping on a bill entered directly', function () {
    $admin = signIn(companyAdmin());
    $vendor = vendorFor($admin->company_id);
    Options::set('pur_inv_prefix', 'BILL# ');
    Options::set('next_pur_inv_number', '725');

    $this->postJson('/api/purchase/invoices', [
        'vendor_id' => $vendor->id, 'vendor_invoice_number' => 'OM/889', 'invoice_date' => today()->toDateString(),
        'discount_type' => 'percent', 'discount_percent' => 10, 'shipping_fee' => 50,
        'items' => [['description' => 'Paper', 'qty' => 10, 'unit_price' => 100]],
    ])->assertCreated()->assertJsonPath('data.invoice_number', 'BILL# 725')->assertJsonPath('data.discount_total', 100)->assertJsonPath('data.total', 950);

    $this->getJson('/api/purchase/invoices?payment_status=unpaid')->assertJsonCount(1, 'data')->assertJsonPath('meta.summary.total', 950);
});

it('keeps purchase areas behind their permissions', function () {
    $admin = companyAdmin();
    $staff = signIn(staffMember($admin->company, ['purchase_requests.create']));
    $this->getJson('/api/purchase/vendors')->assertForbidden();
    $this->getJson('/api/purchase/invoices')->assertForbidden();
    $mine = $this->postJson('/api/purchase/requests', ['name' => 'Chairs', 'items' => [['description' => 'Chair', 'qty' => 1, 'unit_price' => 900]]])->assertCreated()->json('data.id');
    $this->getJson('/api/purchase/requests')->assertJsonCount(1, 'data');

    signIn(staffMember($admin->company, ['purchase_requests.view_own']));
    $this->getJson('/api/purchase/requests')->assertJsonCount(0, 'data');
    $this->getJson("/api/purchase/requests/{$mine}")->assertForbidden();
    expect(PurchaseInvoice::count())->toBe(0);
});
