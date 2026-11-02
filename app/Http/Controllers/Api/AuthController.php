<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\VerifyLoginOtpRequest;
use App\Http\Resources\UserResource;
use App\Models\Company;
use App\Models\Hrms\HrmsAccessToken;
use App\Models\User;
use App\Services\HrmsAuthClient;
use App\Services\HrmsSync;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response as HrmsResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Login, in this order:
 *  1. an account created in the CRM signs in with its CRM password (5 wrong tries lock it for 15
 *     minutes);
 *  2. anyone else signs in through the HRMS API (device_type "projects"), so every HRMS login rule
 *     (OTP, lockout) applies; the HRMS user is then copied into the CRM;
 *  3. while HRMS is unreachable, an HRMS user the CRM already knows signs in with the password HRMS
 *     last had.
 * Either way the CRM issues its own token.
 */
class AuthController extends Controller
{
    /**
     * Fields of an HRMS reply that are passed on when login is not finished yet (wrong password,
     * lockout, OTP / 2FA step, validation errors). Anything else, such as exception text, stays out.
     */
    private const RELAYED_FIELDS = ['status', 'message', 'errors', 'attempts_left', 'otp_required', 'two_factor_required', 'code', 'data'];

    private const MAX_ATTEMPTS = 5;

    private const LOCK_MINUTES = 15;

    public function __construct(private HrmsAuthClient $hrms) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $username = trim((string) $request->input('username'));
        $password = (string) $request->input('password');

        if ($crm = $this->crmAccount($username)) {
            return $this->crmLogin($crm, $password);
        }

        try {
            $response = $this->hrms->login([
                'username' => $username,
                'password' => $password,
                ...$this->deviceDetails($request),
            ]);
        } catch (ConnectionException $e) {
            return $this->offlineLogin($username, $password, $e);
        }

        return $this->finishHrmsLogin($response);
    }

    public function verifyLoginOtp(VerifyLoginOtpRequest $request): JsonResponse
    {
        try {
            $response = $this->hrms->verifyLoginOtp([
                ...$request->only(['username', 'otp']),
                ...$this->deviceDetails($request),
            ]);
        } catch (ConnectionException $e) {
            return $this->hrmsUnreachable($e);
        }

        return $this->finishHrmsLogin($response);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'status' => true,
            'data' => ['user' => new UserResource($request->user()->load(['company', 'roles']))],
        ]);
    }

    /**
     * Companies a super admin can switch to.
     */
    public function companies(Request $request): JsonResponse
    {
        abort_unless($request->user()->is_super_admin, 403);

        return response()->json(['data' => Company::orderBy('company_name')->get(['id', 'company_name', 'status'])
            ->map(fn ($c) => ['id' => $c->id, 'name' => $c->company_name, 'status' => $c->status])]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()->currentAccessToken();
        $hrmsToken = $token?->hrms_token ?? null;
        $token?->delete();

        // An HRMS login also ends its HRMS session; HRMS being down does not stop the logout here.
        if ($hrmsToken) {
            try {
                $this->hrms->logout($hrmsToken);
            } catch (Throwable $e) {
                Log::warning('HRMS logout failed.', ['error' => $e->getMessage()]);
            }
        }

        return response()->json(['status' => true, 'message' => 'Logout successful']);
    }

    /** A CRM-only account matching the username (its username or e-mail). */
    private function crmAccount(string $username): ?User
    {
        $username = strtolower($username);

        return User::where('source', User::SOURCE_CRM)
            ->where(fn ($q) => $q->whereRaw('lower(username) = ?', [$username])->orWhereRaw('lower(email) = ?', [$username]))
            ->first();
    }

    private function crmLogin(User $user, string $password): JsonResponse
    {
        if ($user->locked_until?->isFuture()) {
            $minutes = (int) ceil(now()->diffInSeconds($user->locked_until) / 60);

            return response()->json(['status' => false, 'message' => "Too many wrong passwords. Try again in {$minutes} minute(s)."], 423);
        }
        if (! $user->password || ! Hash::check($password, $user->password)) {
            $failed = $user->failed_logins + 1;
            $locked = $failed >= self::MAX_ATTEMPTS;
            $user->forceFill(['failed_logins' => $locked ? 0 : $failed, 'locked_until' => $locked ? now()->addMinutes(self::LOCK_MINUTES) : null])->save();

            return response()->json($locked
                ? ['status' => false, 'message' => 'Too many wrong passwords. Try again in '.self::LOCK_MINUTES.' minute(s).']
                : ['status' => false, 'message' => 'Invalid credentials', 'attempts_left' => self::MAX_ATTEMPTS - $failed], $locked ? 423 : 401);
        }

        return $this->issue($user);
    }

    /**
     * HRMS answered: pass on anything short of a token; with a token, copy the HRMS user into the
     * CRM and sign them in here.
     */
    private function finishHrmsLogin(HrmsResponse $response): JsonResponse
    {
        $body = $response->json() ?? [];
        $hrmsToken = data_get($body, 'data.access_token');

        if (! $response->successful() || ! $hrmsToken) {
            return response()->json(Arr::only($body, self::RELAYED_FIELDS), $response->status());
        }

        // The user behind the token, read from HRMS itself (never trust the reply's user data).
        [$tokenId, $plain] = array_pad(explode('|', (string) $hrmsToken, 2), 2, '');
        $row = HrmsAccessToken::query()->where('id', (int) $tokenId)->first();
        $user = $row && hash_equals((string) $row->token, hash('sha256', $plain)) ? HrmsSync::user((int) $row->tokenable_id) : null;

        if (! $user) {
            Log::error('HRMS login returned a token this app cannot find in the HRMS database.');

            return response()->json(['status' => false, 'message' => 'Login could not be completed. Please try again.'], 500);
        }

        return $this->issue($user, (string) $hrmsToken);
    }

    /**
     * HRMS is down: an HRMS user the CRM knows (by e-mail, employee code or mobile) may sign in with
     * the password HRMS last had.
     */
    private function offlineLogin(string $username, string $password, ConnectionException $e): JsonResponse
    {
        $key = strtolower($username);
        $user = User::where('source', User::SOURCE_HRMS)
            ->where(fn ($q) => $q->whereRaw('lower(email) = ?', [$key])->orWhereRaw('lower(employee_code) = ?', [$key])->orWhere('mobile', $username))
            ->first();

        if (! $user || ! $user->password || ! Hash::check($password, $user->password)) {
            return $this->hrmsUnreachable($e);
        }

        return $this->issue($user);
    }

    private function issue(User $user, ?string $hrmsToken = null): JsonResponse
    {
        if (! $user->canUseApp()) {
            return response()->json(['status' => false, 'message' => 'Your account is not active. Please contact your administrator.'], 403);
        }

        $token = $user->createToken('projects');
        if ($hrmsToken) {
            $token->accessToken->forceFill(['hrms_token' => $hrmsToken])->save();
        }
        $user->forceFill(['last_login_at' => now(), 'failed_logins' => 0, 'locked_until' => null])->save();

        return response()->json([
            'status' => true,
            'message' => 'Login successful',
            'data' => [
                'access_token' => $token->plainTextToken,
                'user' => new UserResource($user->load(['company', 'roles'])),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function deviceDetails(Request $request): array
    {
        return [
            'device_id' => $request->input('device_id'),
            'device_type' => 'projects',
            'device_model' => Str::limit((string) $request->userAgent(), 250, ''),
            'ip_address' => $request->ip(),
        ];
    }

    private function hrmsUnreachable(ConnectionException $e): JsonResponse
    {
        Log::error('HRMS login API is not reachable.', ['error' => $e->getMessage()]);

        return response()->json([
            'status' => false,
            'message' => 'Login service is not reachable right now. Please try again in a moment.',
        ], 503);
    }
}
