<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;

it('lets admins create CRM-only staff who can then log in without HRMS', function () {
    $admin = signIn(companyAdmin());
    Http::fake();

    $id = $this->postJson('/api/staff-members', ['first_name' => 'Ravi', 'last_name' => 'Patil', 'email' => 'Ravi@GIC.test', 'username' => 'ravi', 'password' => 'crm-pass-1'])
        ->assertCreated()->assertJsonPath('data.source', 'crm')->assertJsonPath('data.full_name', 'Ravi Patil')->json('data.id');

    expect($id)->toBeGreaterThanOrEqual(1000001)
        ->and(User::find($id)->company_id)->toBe($admin->company_id)
        ->and(DB::connection('hrms')->table('users')->where('email', 'ravi@gic.test')->exists())->toBeFalse();
    // Shown in pickers and the staff list.
    expect(collect($this->getJson('/api/staff')->json('data'))->pluck('id'))->toContain($id);

    $this->postJson('/api/staff-members', ['first_name' => 'Dup', 'email' => 'ravi@gic.test', 'password' => 'crm-pass-1'])->assertJsonValidationErrors('email');

    app('auth')->forgetGuards();
    $this->postJson('/api/login', ['username' => 'ravi', 'password' => 'crm-pass-1', 'device_id' => 'b'])->assertOk();
    Http::assertNothingSent();
});

it('edits CRM staff, signs them out when deactivated and leaves HRMS accounts to HRMS', function () {
    $admin = signIn(companyAdmin());
    $crm = User::factory()->for($admin->company)->create(['source' => 'crm', 'password' => Hash::make('crm-pass-1')]);
    $hrms = User::factory()->for($admin->company)->create();
    $token = $crm->createToken('projects');

    $this->putJson("/api/staff-members/{$crm->id}", ['first_name' => 'New', 'email' => $crm->email, 'is_active' => false, 'password' => 'new-pass-12'])
        ->assertOk()->assertJsonPath('data.is_active', false);
    expect(Hash::check('new-pass-12', $crm->fresh()->password))->toBeTrue()
        ->and($crm->tokens()->count())->toBe(0);

    $this->putJson("/api/staff-members/{$hrms->id}", ['first_name' => 'X', 'email' => $hrms->email])->assertStatus(422);
    $this->deleteJson("/api/staff-members/{$hrms->id}")->assertStatus(422);
    $this->deleteJson("/api/staff-members/{$crm->id}")->assertOk();
    expect(User::find($crm->id))->toBeNull();

    signIn(staffMember($admin->company));
    $this->getJson('/api/staff-members')->assertForbidden();
});

it('copies HRMS users in and deactivates the ones HRMS no longer has', function () {
    signIn(companyAdmin());
    $hrms = hrmsAccount(['employee_code' => 'E-7']);
    $gone = User::factory()->create();
    $crmOnly = User::factory()->create(['source' => 'crm']);

    $this->postJson('/api/staff-members/sync')->assertOk();

    $copied = User::find($hrms['id']);
    expect($copied->source)->toBe('hrms')->and($copied->employee_code)->toBe('E-7')->and($copied->company->company_name)->toBe('HRMS Co')
        ->and($gone->fresh()->is_active)->toBeFalse()
        ->and($crmOnly->fresh()->is_active)->toBeTrue();
});
