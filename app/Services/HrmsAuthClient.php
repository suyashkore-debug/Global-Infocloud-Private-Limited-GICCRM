<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Talks to the HRMS login API. HRMS owns every login rule (password check, lockout, OTP / 2FA,
 * inactive user or company, web-login switch), so this app never checks passwords itself.
 */
class HrmsAuthClient
{
    /**
     * @param  array<string, mixed>  $payload
     *
     * @throws ConnectionException
     */
    public function login(array $payload): Response
    {
        return $this->request()->post('/login', $payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     *
     * @throws ConnectionException
     */
    public function verifyLoginOtp(array $payload): Response
    {
        return $this->request()->post('/login/verify-otp', $payload);
    }

    /**
     * @throws ConnectionException
     */
    public function logout(string $token): Response
    {
        return $this->request()->withToken($token)->post('/logout');
    }

    /**
     * Profile changes go to HRMS, which owns the user (name, phone, photo, password), sent
     * with the user's own token so HRMS applies its own rules.
     *
     * @param  array<string, mixed>  $payload
     *
     * @throws ConnectionException
     */
    public function updateProfile(string $token, array $payload): Response
    {
        return $this->request()->withToken($token)->patch('/profile/update', $payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     *
     * @throws ConnectionException
     */
    public function changePassword(string $token, array $payload): Response
    {
        return $this->request()->withToken($token)->post('/profile/change-password', $payload);
    }

    /**
     * @throws ConnectionException
     */
    public function changePhoto(string $token, string $dataUri): Response
    {
        return $this->request()->withToken($token)->post('/profile/change-photo', ['photo' => $dataUri]);
    }

    /**
     * Forgotten password, HRMS's three steps: email a code, check the code, set the new password.
     *
     * @throws ConnectionException
     */
    public function forgotPasswordSendOtp(string $email): Response
    {
        return $this->request()->post('/forgot-password/send-otp', ['email' => $email]);
    }

    /**
     * @throws ConnectionException
     */
    public function forgotPasswordVerifyOtp(string $email, string $otp): Response
    {
        return $this->request()->post('/forgot-password/verify-otp', ['email' => $email, 'otp' => $otp]);
    }

    /**
     * @throws ConnectionException
     */
    public function forgotPasswordReset(string $email, string $password, string $confirmation): Response
    {
        return $this->request()->post('/forgot-password/reset', ['email' => $email, 'password' => $password, 'password_confirmation' => $confirmation]);
    }

    private function request(): PendingRequest
    {
        return Http::baseUrl(config('services.hrms.api_url'))
            ->acceptJson()
            ->timeout(config('services.hrms.timeout'));
    }
}
