<?php

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

function fakeHrmsLoginReturningTokenFor(User $user): void
{
    Http::fake(function (Request $request) use ($user) {
        return Http::response([
            'status' => true,
            'message' => 'Login successful',
            'data' => ['user' => ['id' => $user->id], 'access_token' => $user->createToken('projects')->plainTextToken],
        ]);
    });
}

it('signs in through HRMS as the "projects" device and returns the token with the user', function () {
    $user = User::factory()->create(['email' => 'priya@example.com']);
    fakeHrmsLoginReturningTokenFor($user);

    $response = $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertOk()
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.email', 'priya@example.com')
        ->assertJsonPath('data.user.company.company_name', $user->company->company_name);

    expect($response->json('data.access_token'))->toBeString()->not->toBeEmpty();

    Http::assertSent(fn (Request $request) => $request->url() === 'http://hrms.test/api/v1/login'
        && $request['username'] === 'priya@example.com'
        && $request['password'] === 'secret123'
        && $request['device_id'] === 'browser-1'
        && $request['device_type'] === 'projects');
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
    $user = User::factory()->companyAdmin()->create();
    fakeHrmsLoginReturningTokenFor($user);

    $this->postJson('/api/login/verify-otp', ['username' => $user->email, 'otp' => '123456', 'device_id' => 'browser-1'])
        ->assertOk()
        ->assertJsonPath('data.user.id', $user->id);

    Http::assertSent(fn (Request $request) => $request->url() === 'http://hrms.test/api/v1/login/verify-otp'
        && $request['otp'] === '123456'
        && $request['device_type'] === 'projects');
});

it('does not leak HRMS exception details', function () {
    Http::fake(['hrms.test/*' => Http::response(['status' => false, 'message' => 'Something went wrong', 'error' => 'SQLSTATE[HY000] secret detail'], 500)]);

    $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertStatus(500)
        ->assertExactJson(['status' => false, 'message' => 'Something went wrong']);
});

it('says the login service is unreachable when HRMS is down', function () {
    Http::fake(fn () => throw new ConnectionException('Connection refused'));

    $this->postJson('/api/login', ['username' => 'priya@example.com', 'password' => 'secret123', 'device_id' => 'browser-1'])
        ->assertServiceUnavailable()
        ->assertJsonPath('status', false);
});

it('validates the login form before calling HRMS', function () {
    Http::fake();

    $this->postJson('/api/login', [])->assertUnprocessable()->assertJsonValidationErrors(['username', 'password', 'device_id']);

    Http::assertNothingSent();
});
