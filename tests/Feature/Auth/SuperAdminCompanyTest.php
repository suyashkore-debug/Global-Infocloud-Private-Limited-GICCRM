<?php

use App\Models\Company;
use App\Models\Customer;
use App\Models\User;

it('lets a super admin work inside another company with the company header', function () {
    $platform = Company::factory()->create();
    $super = User::factory()->for($platform)->companyAdmin()->create(['is_super_admin' => true]);
    $client = companyAdmin();
    $customer = Customer::factory()->create(['company_id' => $client->company_id, 'name' => 'Client Co']);

    signIn($super);
    $this->getJson('/api/customers')->assertJsonCount(0, 'data');
    $this->getJson('/api/companies')->assertOk()->assertJsonFragment(['id' => $client->company_id]);

    $headers = ['X-Company-Id' => (string) $client->company_id];
    $this->getJson('/api/customers', $headers)->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Client Co');
    $this->getJson("/api/customers/{$customer->id}", $headers)->assertOk();
    $this->getJson('/api/staff', $headers)->assertJsonFragment(['id' => $client->id]);
    $this->getJson('/api/me', $headers)->assertJsonPath('data.user.company.id', $client->company_id)->assertJsonPath('data.user.is_super_admin_acting', true);
    $this->postJson('/api/customers', ['name' => 'Made by super admin'], $headers)->assertCreated();
    expect(Customer::withoutGlobalScopes()->where('name', 'Made by super admin')->value('company_id'))->toBe($client->company_id);
});

it('ignores the company header for everyone else', function () {
    $admin = companyAdmin();
    $other = companyAdmin();
    Customer::factory()->create(['company_id' => $other->company_id]);

    signIn($admin);
    $this->getJson('/api/customers', ['X-Company-Id' => (string) $other->company_id])->assertJsonCount(0, 'data');
    $this->getJson('/api/companies')->assertForbidden();
});
