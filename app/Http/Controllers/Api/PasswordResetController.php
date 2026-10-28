<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\HrmsAuthClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;

/**
 * "Forgot password?" on the CRM login: HRMS owns the account, so its own reset runs — a code
 * emailed to the work address, checked, then the new password (HRMS's password policy applies).
 * This app only relays the three steps.
 */
class PasswordResetController extends Controller
{
    public function __construct(private HrmsAuthClient $hrms) {}

    public function sendOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);

        return $this->relay(fn () => $this->hrms->forgotPasswordSendOtp(strtolower(trim($data['email']))));
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'otp' => ['required', 'digits:6']]);

        return $this->relay(fn () => $this->hrms->forgotPasswordVerifyOtp(strtolower(trim($data['email'])), $data['otp']));
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:6', 'max:255', 'confirmed'],
        ]);

        return $this->relay(fn () => $this->hrms->forgotPasswordReset(strtolower(trim($data['email'])), $data['password'], $data['password']));
    }

    /**
     * Pass on HRMS's answer (status, message, field errors) — nothing else from its response.
     *
     * @param  callable(): Response  $call
     */
    private function relay(callable $call): JsonResponse
    {
        try {
            $response = $call();
        } catch (ConnectionException $e) {
            Log::warning('HRMS unreachable for password reset', ['error' => $e->getMessage()]);

            return response()->json(['status' => false, 'message' => 'The login service is not reachable right now. Please try again in a moment.'], 503);
        }

        $body = Arr::only($response->json() ?? [], ['status', 'message', 'errors']);

        return response()->json($body + ['status' => $response->successful()], $response->status());
    }
}
