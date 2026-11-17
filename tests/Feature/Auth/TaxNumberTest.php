<?php

use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Options;
use App\Support\TaxNumber;

it('checks tax numbers by country', function () {
    expect(TaxNumber::valid('27abcde1234f1z5', 'India'))->toBeTrue()
        ->and(TaxNumber::valid('27ABCDE1234F1Z', 'India'))->toBeFalse()
        ->and(TaxNumber::valid('100123456700003', 'United Arab Emirates'))->toBeTrue()
        ->and(TaxNumber::valid('27ABCDE1234F1Z5', 'United Arab Emirates'))->toBeFalse()
        ->and(TaxNumber::valid('GB 123 4567 89', 'United Kingdom'))->toBeTrue()
        ->and(TaxNumber::valid('anything-goes', 'Japan'))->toBeTrue()
        ->and(TaxNumber::panFromGstin('27ABCDE1234F1Z5'))->toBe('ABCDE1234F');
});

it('checks the new company GSTIN and PAN for India, the TRN for the UAE', function () {
    $this->postJson('/api/company-signup', signupPayload(['gstin' => '27ABCDE1234F1Z']))->assertJsonValidationErrors('gstin');
    $this->postJson('/api/company-signup', signupPayload(['gstin' => '27ABCDE1234F1Z5', 'pan' => 'ZZZZZ9999Z']))->assertJsonValidationErrors('pan');
    $this->postJson('/api/company-signup', signupPayload(['country' => 'United Arab Emirates', 'gstin' => '27ABCDE1234F1Z5']))->assertJsonValidationErrors('gstin');

    // A GSTIN alone brings its PAN.
    $this->postJson('/api/company-signup', signupPayload(['gstin' => '27abcde1234f1z5']))->assertCreated();
    $company = Company::where('company_name', 'Acme Packaging')->first();
    expect(Options::get('company_vat', $company->id))->toBe('27ABCDE1234F1Z5')->and(Options::get('company_pan', $company->id))->toBe('ABCDE1234F');
});

it('checks the company tax number in Setup by its country', function () {
    signIn(companyAdmin());

    $this->putJson('/api/setup/options', ['options' => ['company_country' => 'India', 'company_vat' => '27ABCDE1234F1Z5', 'company_pan' => '']])->assertOk();
    expect(Options::get('company_pan'))->toBe('ABCDE1234F');

    // Moving to the UAE: the Indian GSTIN no longer fits, and PAN goes.
    $this->putJson('/api/setup/options', ['options' => ['company_country' => 'United Arab Emirates', 'company_vat' => '27ABCDE1234F1Z5', 'company_pan' => 'ABCDE1234F']])
        ->assertJsonValidationErrors('company_vat');
    $this->putJson('/api/setup/options', ['options' => ['company_country' => 'United Arab Emirates', 'company_vat' => '100123456700003', 'company_pan' => 'ABCDE1234F']])->assertOk();
    expect(Options::get('company_vat'))->toBe('100123456700003')->and(Options::get('company_pan'))->toBe('')->and(Options::get('tax_id_label'))->toBe('TRN');

    // An old number saved before the checks is kept while it and the country stay the same.
    Options::set('company_vat', 'OLD-123');
    $this->putJson('/api/setup/options', ['options' => ['company_country' => 'United Arab Emirates', 'company_vat' => 'OLD-123', 'company_name' => 'Renamed']])->assertOk();
});

it('checks customer and vendor tax numbers by their own country', function () {
    signIn(companyAdmin());
    Options::set('company_country', 'India');

    // An Indian customer (the company's country when none is set): GSTIN, with the PAN from it.
    $this->postJson('/api/customers', ['name' => 'Desi Co', 'vat' => '27ABCDE1234F1Z'])->assertJsonValidationErrors('vat');
    $this->postJson('/api/customers', ['name' => 'Desi Co', 'vat' => '27ABCDE1234F1Z5', 'company_pan' => 'ZZZZZ9999Z'])->assertJsonValidationErrors('company_pan');
    $id = $this->postJson('/api/customers', ['name' => 'Desi Co', 'vat' => '27 abcde1234f1z5'])->assertCreated()
        ->assertJsonPath('data.vat', '27ABCDE1234F1Z5')->assertJsonPath('data.company_pan', 'ABCDE1234F')->assertJsonPath('data.tax_label', 'GSTIN')->json('data.id');

    // A UK customer: a VAT number; no PAN.
    $this->postJson('/api/customers', ['name' => 'Brit Ltd', 'country' => 'United Kingdom', 'vat' => '27ABCDE1234F1Z5'])->assertJsonValidationErrors('vat');
    $this->postJson('/api/customers', ['name' => 'Brit Ltd', 'country' => 'United Kingdom', 'vat' => 'GB123456789', 'company_pan' => 'ABCDE1234F'])->assertJsonValidationErrors('company_pan');
    $this->postJson('/api/customers', ['name' => 'Brit Ltd', 'country' => 'United Kingdom', 'vat' => 'GB123456789'])->assertCreated()->assertJsonPath('data.tax_label', 'VAT No.');

    // An old number saved before the checks does not block other edits.
    Customer::whereKey($id)->update(['vat' => 'OLD-1', 'company_pan' => null]);
    $this->putJson("/api/customers/{$id}", ['name' => 'Desi Co Renamed', 'vat' => 'OLD-1'])->assertOk();

    // A UAE vendor: its TRN.
    $this->postJson('/api/purchase/vendors', ['name' => 'Gulf Supplies', 'country' => 'United Arab Emirates', 'vat' => '27ABCDE1234F1Z5'])->assertJsonValidationErrors('vat');
    $this->postJson('/api/purchase/vendors', ['name' => 'Gulf Supplies', 'country' => 'United Arab Emirates', 'vat' => '100123456700003'])->assertCreated();
    expect(Vendor::where('name', 'Gulf Supplies')->value('vat'))->toBe('100123456700003');
});
