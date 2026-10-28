<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\VerifyLoginOtpRequest;
use App\Http\Resources\UserResource;
use App\Models\Company;
use App\Models\PersonalAccessToken;
use App\Models\User;
use App\Services\HrmsAuthClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response as HrmsResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Login goes through the HRMS API (device_type "projects"), so HRMS users sign in here with
 * their HRMS password and every HRMS login rule still applies.
 */
class AuthController extends Controller
{
    /**
     * Fields of an HRMS reply that are passed on when login is not finished yet (wrong password,
     * lockout, OTP / 2FA step, validation errors). Anything else, such as exception text, stays out.
     */
    private const RELAYED_FIELDS = ['status', 'message', 'errors', 'attempts_left', 'otp_required', 'two_factor_required', 'code', 'data'];

    public function __construct(private HrmsAuthClient $hrms) {}

    public function login(LoginRequest $request): JsonResponse
    {
        return $this->callHrms(fn () => $this->hrms->login([
            ...$request->only(['username', 'password']),
            ...$this->deviceDetails($request),
        ]));
    }

    public function verifyLoginOtp(VerifyLoginOtpRequest $request): JsonResponse
    {
        return $this->callHrms(fn () => $this->hrms->verifyLoginOtp([
            ...$request->only(['username', 'otp']),
            ...$this->deviceDetails($request),
        ]));
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
        try {
            $this->hrms->logout((string) $request->bearerToken());
        } catch (ConnectionException $e) {
            return $this->hrmsUnreachable($e);
        }

        return response()->json(['status' => true, 'message' => 'Logout successful']);
    }

    /**
     * @param  callable(): HrmsResponse  $call
     */
    private function callHrms(callable $call): JsonResponse
    {
        try {
            $response = $call();
        } catch (ConnectionException $e) {
            return $this->hrmsUnreachable($e);
        }

        $body = $response->json() ?? [];
        $token = data_get($body, 'data.access_token');

        if (! $response->successful() || ! $token) {
            return response()->json(Arr::only($body, self::RELAYED_FIELDS), $response->status());
        }

        // Read the user back through the token itself, so a login only succeeds when this app
        // can also authenticate the token on its following requests.
        $user = PersonalAccessToken::findToken($token)?->tokenable;

        if (! $user instanceof User) {
            Log::error('HRMS login returned a token this app cannot find in the HRMS database.');

            return response()->json(['status' => false, 'message' => 'Login could not be completed. Please try again.'], 500);
        }

        return response()->json([
            'status' => true,
            'message' => 'Login successful',
            'data' => [
                'access_token' => $token,
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
