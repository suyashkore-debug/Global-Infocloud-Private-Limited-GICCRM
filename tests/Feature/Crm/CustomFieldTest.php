<?php

use App\Models\Customer;
use App\Models\CustomFieldValue;
use App\Models\Invoice;
use App\Services\CustomFields;

it('lets admins define fields and saves validated values on records', function () {
    $admin = signIn(companyAdmin());
    $gst = $this->postJson('/api/custom-fields', ['field_to' => 'customers', 'name' => 'GST Number', 'type' => 'input', 'required' => true, 'show_on_table' => true])
        ->assertCreated()->json('data.id');
    $industry = $this->postJson('/api/custom-fields', ['field_to' => 'customers', 'name' => 'Industry', 'type' => 'select', 'options' => ['IT', 'Manufacturing']])->json('data.id');
    $this->postJson('/api/custom-fields', ['field_to' => 'customers', 'name' => 'Bad', 'type' => 'select'])->assertUnprocessable();
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);

    $this->getJson('/api/custom-fields/for/customers')->assertJsonCount(2, 'data');
    $this->putJson("/api/custom-field-values/customers/{$customer->id}", ['custom_fields' => [$gst => '', $industry => 'Retail']])
        ->assertUnprocessable()->assertJsonValidationErrors(["custom_fields.{$gst}", "custom_fields.{$industry}"]);
    $this->putJson("/api/custom-field-values/customers/{$customer->id}", ['custom_fields' => [$gst => '27ABCDE1234F1Z5', $industry => 'IT']])
        ->assertOk()->assertJsonPath("data.{$gst}", '27ABCDE1234F1Z5');

    $this->getJson("/api/custom-field-values/customers?ids[]={$customer->id}")->assertJsonPath("data.{$customer->id}.{$industry}", 'IT');

    $customer->delete();
    expect(CustomFieldValue::count())->toBe(0);
});

it('hides admin-only fields from staff and checks record access', function () {
    $admin = signIn(companyAdmin());
    $this->postJson('/api/custom-fields', ['field_to' => 'invoice', 'name' => 'Internal margin', 'type' => 'number', 'only_admin' => true])->assertCreated();
    $po = $this->postJson('/api/custom-fields', ['field_to' => 'invoice', 'name' => 'PO Number', 'type' => 'input', 'show_on_pdf' => true])->json('data.id');
    $invoice = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id]);
    $this->putJson("/api/custom-field-values/invoice/{$invoice->id}", ['custom_fields' => [$po => 'PO-77']])->assertOk();
    expect(CustomFields::forPdf('invoice', $invoice->id, $admin->company_id))->toBe([['name' => 'PO Number', 'value' => 'PO-77']]);
    $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk();

    signIn(staffMember($admin->company, ['invoices.view']));
    $this->getJson('/api/custom-fields/for/invoice')->assertJsonCount(1, 'data');
    $this->putJson("/api/custom-field-values/invoice/{$invoice->id}", ['custom_fields' => [$po => 'x']])->assertForbidden();
    $this->getJson('/api/custom-fields')->assertForbidden();
});
