<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendTemplateEmail;
use App\Models\EmailLog;
use App\Models\User;
use App\Services\CompanyMailer;
use App\Services\Emails;
use App\Services\HrmsAuthClient;
use App\Services\Options;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

/**
 * "Forgot password?" on the CRM login, in three steps: a 6-digit code e-mailed to the account's
 * address, the code checked, then the new password. Accounts created in the CRM reset here; HRMS
 * accounts run HRMS's own reset (its password policy applies), which this app relays.
 */
class PasswordResetController extends Controller
{
    private const CODE_MINUTES = 10;

    private const MAX_TRIES = 5;

    public function __construct(private HrmsAuthClient $hrms) {}

    public function sendOtp(Request $request): JsonResponse
    {
        $email = strtolower(trim($request->validate(['email' => ['required', 'email', 'max:255']])['email']));

        if ($user = $this->crmAccount($email)) {
            $code = (string) random_int(100000, 999999);
            Cache::put($this->key($user), ['hash' => Hash::make($code), 'tries' => 0, 'verified' => false], now()->addMinutes(self::CODE_MINUTES));
            $this->mailCode($user, $code);

            return $this->sent();
        }
        // A CRM e-mail that is not (or no longer) an active account: answer the same, send nothing.
        if (User::where('source', User::SOURCE_CRM)->whereRaw('lower(email) = ?', [$email])->exists()) {
            return $this->sent();
        }

        return $this->relay(fn () => $this->hrms->forgotPasswordSendOtp($email));
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'otp' => ['required', 'digits:6']]);
        $email = strtolower(trim($data['email']));

        if ($user = $this->crmAccount($email)) {
            $state = Cache::get($this->key($user));
            if (! $state || $state['tries'] >= self::MAX_TRIES) {
                return $this->invalid('The code has expired. Please ask for a new one.');
            }
            if (! Hash::check($data['otp'], $state['hash'])) {
                Cache::put($this->key($user), [...$state, 'tries' => $state['tries'] + 1], now()->addMinutes(self::CODE_MINUTES));

                return $this->invalid('The code is not correct.');
            }
            Cache::put($this->key($user), [...$state, 'verified' => true], now()->addMinutes(self::CODE_MINUTES));

            return response()->json(['status' => true, 'message' => 'Code verified. Choose a new password.']);
        }

        return $this->relay(fn () => $this->hrms->forgotPasswordVerifyOtp($email, $data['otp']));
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:6', 'max:255', 'confirmed'],
        ]);
        $email = strtolower(trim($data['email']));

        if ($user = $this->crmAccount($email)) {
            if (! (Cache::get($this->key($user))['verified'] ?? false)) {
                return $this->invalid('Please verify the code first.');
            }
            if (mb_strlen($data['password']) < 8) {
                return response()->json(['status' => false, 'message' => 'The password must be at least 8 characters.', 'errors' => ['password' => ['The password must be at least 8 characters.']]], 422);
            }
            $user->forceFill(['password' => Hash::make($data['password']), 'failed_logins' => 0, 'locked_until' => null])->save();
            $user->tokens()->delete();
            Cache::forget($this->key($user));

            return response()->json(['status' => true, 'message' => 'Your password has been changed. You can log in now.']);
        }

        return $this->relay(fn () => $this->hrms->forgotPasswordReset($email, $data['password'], $data['password']));
    }

    private function crmAccount(string $email): ?User
    {
        return User::where('source', User::SOURCE_CRM)->where('is_active', true)->whereRaw('lower(email) = ?', [$email])->first();
    }

    private function key(User $user): string
    {
        return "crm-password-reset:{$user->id}";
    }

    /** The code, sent from the company's e-mail settings (queued, logged like every e-mail). */
    private function mailCode(User $user, string $code): void
    {
        $companyId = (int) $user->company_id;
        $company = e(Options::companyName($companyId));
        $subject = 'Your password reset code';
        $html = Emails::wrap("<p>Hello ".e((string) $user->first_name).",</p><p>Use this code to reset your {$company} CRM password:</p>"
            ."<p style=\"font-size:26px;font-weight:bold;letter-spacing:6px\">{$code}</p>"
            .'<p>The code is valid for '.self::CODE_MINUTES.' minutes. If you did not ask for it, you can ignore this e-mail.</p>', $companyId);
        $log = EmailLog::create(['company_id' => $companyId, 'template' => 'staff-password-reset-code', 'to' => (string) $user->email, 'subject' => $subject, 'user_id' => $user->id]);
        $from = CompanyMailer::from($companyId, null);
        SendTemplateEmail::dispatch($companyId, $log->id, [(string) $user->email], [], $subject, $html, $from['address'], $from['name'], []);
    }

    private function sent(): JsonResponse
    {
        return response()->json(['status' => true, 'message' => 'We have e-mailed you a 6-digit code.']);
    }

    private function invalid(string $message): JsonResponse
    {
        return response()->json(['status' => false, 'message' => $message, 'errors' => ['otp' => [$message]]], 422);
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
