<?php

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

it('relays the three HRMS reset steps and only HRMS\'s answer', function () {
    Http::fake([
        '*/forgot-password/send-otp' => Http::response(['status' => true, 'message' => 'If this email is registered, an OTP has been sent to it.', 'debug' => 'secret'], 200),
        '*/forgot-password/verify-otp' => Http::response(['status' => false, 'message' => 'Invalid OTP.'], 400),
        '*/forgot-password/reset' => Http::response(['status' => false, 'message' => 'Use at least one number.', 'errors' => ['password' => ['Use at least one number.']]], 422),
    ]);

    $this->postJson('/api/forgot-password/send-otp', ['email' => ' Asha@Acme.Test '])->assertOk()
        ->assertJson(['status' => true])->assertJsonMissingPath('debug');
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/forgot-password/send-otp') && $r['email'] === 'asha@acme.test');

    $this->postJson('/api/forgot-password/verify-otp', ['email' => 'asha@acme.test', 'otp' => '123456'])->assertStatus(400)->assertJsonPath('message', 'Invalid OTP.');
    $this->postJson('/api/forgot-password/verify-otp', ['email' => 'asha@acme.test', 'otp' => '12ab'])->assertJsonValidationErrors('otp');

    $this->postJson('/api/forgot-password/reset', ['email' => 'asha@acme.test', 'password' => 'abcdefg', 'password_confirmation' => 'abcdefg'])
        ->assertStatus(422)->assertJsonPath('errors.password.0', 'Use at least one number.');
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/forgot-password/reset') && $r['password_confirmation'] === 'abcdefg');
    $this->postJson('/api/forgot-password/reset', ['email' => 'asha@acme.test', 'password' => 'abcdefg', 'password_confirmation' => 'other'])->assertJsonValidationErrors('password');
});

it('says so when HRMS cannot be reached', function () {
    Http::fake(fn () => throw new ConnectionException('down'));

    $this->postJson('/api/forgot-password/send-otp', ['email' => 'asha@acme.test'])->assertStatus(503)->assertJsonPath('status', false);
});
