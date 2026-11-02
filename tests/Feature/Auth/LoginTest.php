<?php

use App\Models\PersonalAccessToken;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;

function fakeHrmsLoginReturning(string $hrmsToken): void
{
    Http::fake(fn () => Http::response(['status' => true, 'message' => 'Login successful', 'data' => ['access_token' => $hrmsToken]]));
}

it('signs HRMS users in through HRMS, copies them into the CRM and issues a CRM token', function () {
    $hrms = hrmsAccount();
    fakeHrmsLoginReturning($hrms['token']);

    $response = $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertOk()
        ->assertJsonPath('data.user.id', $hrms['id'])
        ->assertJsonPath('data.user.email', 'priya@example.com')
        ->assertJsonPath('data.user.company.company_name', 'HRMS Co');

    Http::assertSent(fn (Request $request) => $request->url() === 'http://hrms.test/api/v1/login'
        && $request['username'] === 'priya@example.com' && $request['password'] === 'secret123'
        && $request['device_id'] === 'browser-1' && $request['device_type'] === 'projects');

    $user = User::find($hrms['id']);
    expect($user->source)->toBe('hrms')
        ->and(Hash::check('secret123', $user->password))->toBeTrue()
        ->and(PersonalAccessToken::where('tokenable_id', $user->id)->first()->hrms_token)->toBe($hrms['token']);

    // The CRM's own token works from now on.
    app('auth')->forgetGuards();
    $this->withToken($response->json('data.access_token'))->getJson('/api/me')->assertOk()->assertJsonPath('data.user.id', $hrms['id']);
});

it('refuses an HRMS reply whose token HRMS does not know', function () {
    fakeHrmsLoginReturning('999|made-up');

    $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])->assertStatus(500);
});

it('passes on a wrong password reply from HRMS with the attempts left', function () {
    Http::fake(['hrms.test/*' => Http::response(['status' => false, 'message' => 'Invalid credentials', 'attempts_left' => 3], 401)]);

    $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'wrong-pass', 'device_id' => 'browser-1'])
        ->assertUnauthorized()
        ->assertExactJson(['status' => false, 'message' => 'Invalid credentials', 'attempts_left' => 3]);
});

it('passes on the OTP step HRMS asks admins and HR for', function () {
    Http::fake(['hrms.test/*' => Http::response([
        'status' => true,
        'otp_required' => true,
        'message' => "We've emailed you a verification code.",
        'data' => ['username' => 'admin@example.com', 'email_hint' => 'a***n@example.com'],
    ])]);

    $this->postJson('/api/login', ['username' => 'admin@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertOk()
        ->assertJsonPath('otp_required', true)
        ->assertJsonPath('data.email_hint', 'a***n@example.com')
        ->assertJsonMissingPath('data.access_token');
});

it('finishes an OTP login through HRMS verify-otp', function () {
    $hrms = hrmsAccount(['is_company_admin' => true]);
    fakeHrmsLoginReturning($hrms['token']);

    $this->postJson('/api/login/verify-otp', ['username' => 'priya@example.com', 'otp' => '123456', 'device_id' => 'browser-1'])
        ->assertOk()
        ->assertJsonPath('data.user.id', $hrms['id']);

    Http::assertSent(fn (Request $request) => $request->url() === 'http://hrms.test/api/v1/login/verify-otp'
        && $request['otp'] === '123456' && $request['device_type'] === 'projects');
});

it('does not leak HRMS exception details', function () {
    Http::fake(['hrms.test/*' => Http::response(['status' => false, 'message' => 'Something went wrong', 'error' => 'SQLSTATE[HY000] secret detail'], 500)]);

    $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertStatus(500)
        ->assertExactJson(['status' => false, 'message' => 'Something went wrong']);
});

it('signs a known HRMS user in with the last HRMS password while HRMS is down', function () {
    $user = User::factory()->create(['email' => 'priya@example.com', 'password' => Hash::make('secret123')]);
    Http::fake(fn () => throw new ConnectionException('Connection refused'));

    $this->postJson('/api/login', ['username' => 'Priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertOk()->assertJsonPath('data.user.id', $user->id);
    // Wrong password or unknown user: HRMS is needed, and it is down.
    $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'nope', 'device_id' => 'browser-1'])->assertServiceUnavailable();
    $this->postJson('/api/login', ['username' => 'someone@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertServiceUnavailable()->assertJsonPath('status', false);
});

it('signs CRM accounts in with their CRM password, without asking HRMS, and locks after 5 wrong tries', function () {
    Http::fake();
    $user = User::factory()->create(['source' => 'crm', 'username' => 'ravi', 'email' => 'ravi@gic.test', 'password' => Hash::make('crm-pass-1')]);

    $this->postJson('/api/login', ['username' => 'RAVI', 'password' => 'crm-pass-1', 'device_id' => 'b'])->assertOk()->assertJsonPath('data.user.id', $user->id);
    $this->postJson('/api/login', ['username' => 'ravi@gic.test', 'password' => 'crm-pass-1', 'device_id' => 'b'])->assertOk();

    $this->postJson('/api/login', ['username' => 'ravi', 'password' => 'bad', 'device_id' => 'b'])->assertUnauthorized()->assertJsonPath('attempts_left', 4);
    foreach (range(1, 3) as $i) {
        $this->postJson('/api/login', ['username' => 'ravi', 'password' => 'bad', 'device_id' => 'b']);
    }
    $this->postJson('/api/login', ['username' => 'ravi', 'password' => 'bad', 'device_id' => 'b'])->assertStatus(423);
    // Locked: even the right password waits.
    $this->postJson('/api/login', ['username' => 'ravi', 'password' => 'crm-pass-1', 'device_id' => 'b'])->assertStatus(423);
    $this->travel(16)->minutes();
    $this->postJson('/api/login', ['username' => 'ravi', 'password' => 'crm-pass-1', 'device_id' => 'b'])->assertOk();

    Http::assertNothingSent();
});

it('refuses inactive CRM accounts', function () {
    User::factory()->inactive()->create(['source' => 'crm', 'username' => 'old', 'password' => Hash::make('crm-pass-1')]);

    $this->postJson('/api/login', ['username' => 'old', 'password' => 'crm-pass-1', 'device_id' => 'b'])->assertForbidden();
});

it('validates the login form before calling HRMS', function () {
    Http::fake();

    $this->postJson('/api/login', [])->assertUnprocessable()->assertJsonValidationErrors(['username', 'password', 'device_id']);

    Http::assertNothingSent();
});
