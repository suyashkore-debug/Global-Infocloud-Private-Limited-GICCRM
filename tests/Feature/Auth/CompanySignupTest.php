<?php

use App\Models\Company;
use App\Models\User;
use App\Services\Options;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

function signupPayload(array $overrides = []): array
{
    return [
        'company_name' => 'Acme Packaging', 'short_code' => 'acme', 'company_phone' => '020 1234',
        'first_name' => 'Asha', 'last_name' => 'Rao', 'email' => 'asha@acme.test', 'username' => 'asha',
        'password' => 'acme-pass-1', 'password_confirmation' => 'acme-pass-1', ...$overrides,
    ];
}

it('opens a CRM-only company with its admin, who logs in and adds the team', function () {
    Http::fake();

    $this->postJson('/api/company-signup', signupPayload())->assertCreated()->assertJsonPath('data.username', 'asha');

    $company = Company::where('company_name', 'Acme Packaging')->first();
    $admin = User::where('email', 'asha@acme.test')->first();
    expect($company->source)->toBe('crm')->and($company->id)->toBeGreaterThanOrEqual(1000001)->and($company->portalSlug())->toBe('acme')
        ->and($admin->company_id)->toBe($company->id)->and($admin->isAdmin())->toBeTrue()->and($admin->isCrmAccount())->toBeTrue()
        ->and(Options::companyName($company->id))->toBe('Acme Packaging')
        ->and(DB::connection('hrms')->table('companies')->where('company_name', 'Acme Packaging')->exists())->toBeFalse();

    $token = $this->postJson('/api/login', ['username' => 'asha', 'password' => 'acme-pass-1', 'device_id' => 'b'])->assertOk()->json('data.access_token');
    $this->withToken($token)->postJson('/api/staff-members', ['first_name' => 'Ravi', 'email' => 'ravi@acme.test', 'password' => 'ravi-pass-1'])->assertCreated();
    expect(User::where('email', 'ravi@acme.test')->value('company_id'))->toBe($company->id);
    Http::assertNothingSent();
});

it('checks the sign-up form', function () {
    User::factory()->create(['email' => 'taken@x.test']);

    $this->postJson('/api/company-signup', signupPayload(['email' => 'taken@x.test', 'password_confirmation' => 'other', 'company_name' => '']))
        ->assertJsonValidationErrors(['email', 'password', 'company_name']);
});

it('resets a CRM account password with an e-mailed code, without HRMS', function () {
    Http::fake();
    Queue::fake();
    $user = User::factory()->create(['source' => 'crm', 'email' => 'ravi@gic.test', 'password' => Hash::make('old-pass-1')]);

    $this->postJson('/api/forgot-password/send-otp', ['email' => 'Ravi@gic.test'])->assertOk();
    Queue::assertPushed(App\Jobs\SendTemplateEmail::class, fn ($job) => $job->to === ['ravi@gic.test']);

    // Replace the e-mailed code with a known one.
    Cache::put("crm-password-reset:{$user->id}", ['hash' => Hash::make('123456'), 'tries' => 0, 'verified' => false], now()->addMinutes(10));
    $this->postJson('/api/forgot-password/reset', ['email' => 'ravi@gic.test', 'password' => 'new-pass-1', 'password_confirmation' => 'new-pass-1'])->assertStatus(422);
    $this->postJson('/api/forgot-password/verify-otp', ['email' => 'ravi@gic.test', 'otp' => '654321'])->assertStatus(422);
    $this->postJson('/api/forgot-password/verify-otp', ['email' => 'ravi@gic.test', 'otp' => '123456'])->assertOk();
    $this->postJson('/api/forgot-password/reset', ['email' => 'ravi@gic.test', 'password' => 'new-pass-1', 'password_confirmation' => 'new-pass-1'])->assertOk();

    expect(Hash::check('new-pass-1', $user->fresh()->password))->toBeTrue();
    Http::assertNothingSent();
});

it('takes the logo, GSTIN and PAN at sign-up and lets the admin change the logo later', function () {
    Illuminate\Support\Facades\Storage::fake('public');
    Http::fake();

    $this->post('/api/company-signup', signupPayload(['gstin' => '27abcde1234f1z5', 'pan' => 'abcde1234f', 'logo' => Illuminate\Http\UploadedFile::fake()->image('logo.png', 200, 80)]), ['Accept' => 'application/json'])
        ->assertCreated();
    $company = Company::where('company_name', 'Acme Packaging')->first();
    expect(Options::get('company_vat', $company->id))->toBe('27ABCDE1234F1Z5')
        ->and(Options::get('company_pan', $company->id))->toBe('ABCDE1234F')
        ->and($company->crm_logo)->toStartWith("company-logos/{$company->id}/")
        ->and(App\Support\PdfBrand::logo($company->id))->toStartWith('data:image/png;base64,');

    $this->postJson('/api/company-signup', signupPayload(['email' => 'b@x.test', 'short_code' => 'b', 'gstin' => '123', 'pan' => 'XYZ']))->assertJsonValidationErrors(['gstin', 'pan']);

    $admin = User::where('email', 'asha@acme.test')->first();
    signIn($admin);
    $old = $company->crm_logo;
    $this->post('/api/setup/company-logo', ['logo' => Illuminate\Http\UploadedFile::fake()->image('new.jpg', 100, 40)], ['Accept' => 'application/json'])->assertOk();
    Illuminate\Support\Facades\Storage::disk('public')->assertMissing($old);
    expect($this->getJson('/api/me')->json('data.user.company.logo_url'))->toContain('company-logos/');
    $this->deleteJson('/api/setup/company-logo')->assertOk();
    expect($company->fresh()->crm_logo)->toBeNull();

    signIn(staffMember($company));
    $this->deleteJson('/api/setup/company-logo')->assertForbidden();
});
