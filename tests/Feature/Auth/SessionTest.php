<?php

use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

it('returns the signed-in user with company and roles', function () {
    $user = User::factory()->create();
    $role = Role::forceCreate(['company_id' => $user->company_id, 'name' => 'Project Manager', 'slug' => 'project-manager']);
    DB::table('crm_user_roles')->insert(['user_id' => $user->id, 'role_id' => $role->id]);
    $token = $user->createToken('projects')->plainTextToken;

    $this->withToken($token)->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.roles.0.slug', 'project-manager')
        ->assertJsonMissingPath('data.user.password');
});

it('rejects requests without a valid token', function () {
    $this->getJson('/api/me')->assertUnauthorized();
    $this->withToken('1|not-a-real-token')->getJson('/api/me')->assertUnauthorized();
});

it('signs out a user HR has deactivated', function () {
    $user = User::factory()->create();
    $token = $user->createToken('projects')->plainTextToken;
    $user->forceFill(['is_active' => false])->save();

    $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
});

it('signs out a deleted user', function () {
    $user = User::factory()->create();
    $token = $user->createToken('projects')->plainTextToken;
    $user->delete();

    $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
});

it('signs out users of a company that is no longer active', function () {
    $employee = User::factory()->for(Company::factory()->inactive())->create();

    $this->withToken($employee->createToken('projects')->plainTextToken)->getJson('/api/me')->assertUnauthorized();
});

it('lets super admins in whatever their company status', function () {
    $superAdmin = User::factory()->for(Company::factory()->inactive())->create(['is_super_admin' => true]);

    $this->withToken($superAdmin->createToken('projects')->plainTextToken)->getJson('/api/me')->assertOk();
});

it('logs out here and, for an HRMS login, from HRMS with its HRMS token', function () {
    $user = User::factory()->create();
    $token = crmToken($user, '7|hrms-token');
    Http::fake(['hrms.test/*' => Http::response(['status' => true, 'message' => 'Logout successful'])]);

    $this->withToken($token)->postJson('/api/logout')->assertOk();

    Http::assertSent(fn (Request $request) => $request->url() === 'http://hrms.test/api/v1/logout'
        && $request->hasHeader('Authorization', 'Bearer 7|hrms-token'));
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
});

it('logs a CRM account out without HRMS', function () {
    Http::fake();
    $token = crmToken(User::factory()->create(['source' => 'crm']));

    $this->withToken($token)->postJson('/api/logout')->assertOk();
    Http::assertNothingSent();
});
