<?php

use App\Models\Company;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\StaffPermission;
use App\Models\User;
use App\Services\Options;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\HrmsTestDatabase;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->beforeEach(function () {
        HrmsTestDatabase::reset();
        Options::flush();
    })
    ->in('Feature');

/**
 * A company admin of a new company (Perfex admin: every permission).
 */
function companyAdmin(?Company $company = null): User
{
    return User::factory()->for($company ?? Company::factory())->companyAdmin()->create();
}

/**
 * A plain employee of the company, with the given "feature.capability" permissions.
 *
 * @param  array<int, string>  $permissions
 */
function staffMember(Company $company, array $permissions = []): User
{
    $user = User::factory()->for($company)->create();
    foreach ($permissions as $permission) {
        [$feature, $capability] = explode('.', $permission);
        StaffPermission::withoutGlobalScopes()->create(['company_id' => $company->id, 'user_id' => $user->id, 'feature' => $feature, 'capability' => $capability]);
    }

    return $user;
}

function signIn(User $user): User
{
    Sanctum::actingAs($user);
    app('auth')->forgetGuards();
    Sanctum::actingAs($user);

    return $user;
}

/**
 * A company admin and a customer contact (Asha) who can log in to the customers area.
 */
function chatCustomerSetup(): array
{
    $admin = companyAdmin();
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Acme']);
    $contact = Contact::create(['customer_id' => $customer->id, 'first_name' => 'Asha', 'email' => 'asha@acme.test', 'password' => 'secret123', 'is_primary' => true, 'active' => true]);

    return [$admin, $customer, $contact];
}

function chatCustomerLogin($test): array
{
    return ['Authorization' => 'Bearer '.$test->postJson('/api/portal/login', ['email' => 'asha@acme.test', 'password' => 'secret123'])->assertOk()->json('data.token')];
}
