<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Exotel;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Setup → Calls (the company's Exotel account and staff numbers) and the public webhooks Exotel
 * calls with the result of every call.
 */
class TelephonyController extends Controller
{
    public function __construct(private Exotel $exotel) {}

    public function settings(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $numbers = Exotel::staffNumbers($company);

        return response()->json(['data' => [
            ...collect(Exotel::KEYS)->mapWithKeys(fn ($k) => [$k => Options::get($k, $company)])->all(),
            'has_api_key' => Options::secret('calls_exotel_api_key', $company) !== '',
            'has_api_token' => Options::secret('calls_exotel_api_token', $company) !== '',
            'status_url' => Exotel::statusUrl($company),
            'incoming_url' => Exotel::incomingUrl($company),
            // Every active staff member with the number their calls ring: the one set here, or
            // the mobile number from their HRMS profile.
            'staff' => User::where('company_id', $company)->where('is_active', true)->orderBy('full_name')->get()->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->full_name,
                'number' => $numbers[$u->id] ?? '',
                'hrms_mobile' => $u->mobile,
            ]),
        ]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $data = $request->validate([
            'calls_provider' => ['nullable', Rule::in(['', 'exotel'])],
            'calls_exotel_subdomain' => ['nullable', Rule::in(['api.exotel.com', 'api.in.exotel.com'])],
            'calls_exotel_sid' => ['nullable', 'string', 'max:100'],
            'calls_caller_id' => ['nullable', 'string', 'max:20', 'regex:/^[\d+ ]*$/'],
            'calls_record' => ['nullable', 'in:0,1'],
            'calls_country_code' => ['nullable', 'string', 'max:5', 'regex:/^\d*$/'],
            'calls_exotel_api_key' => ['nullable', 'string', 'max:200'],
            'calls_exotel_api_token' => ['nullable', 'string', 'max:200'],
            'clear_credentials' => ['boolean'],
            'staff_numbers' => ['array'],
            'staff_numbers.*' => ['nullable', 'string', 'max:20', 'regex:/^[\d+ \-]*$/'],
        ]);

        foreach (Exotel::KEYS as $key) {
            if (array_key_exists($key, $data)) {
                Options::set($key, trim((string) ($data[$key] ?? '')), $company);
            }
        }
        foreach (['calls_exotel_api_key', 'calls_exotel_api_token'] as $key) {
            if (! empty($data[$key])) {
                Options::setSecret($key, trim($data[$key]), $company);
            }
        }
        if ($data['clear_credentials'] ?? false) {
            Options::setSecret('calls_exotel_api_key', '', $company);
            Options::setSecret('calls_exotel_api_token', '', $company);
        }
        if (array_key_exists('staff_numbers', $data)) {
            $staff = User::where('company_id', $company)->pluck('id')->all();
            Options::set('calls_staff_numbers', json_encode(collect($data['staff_numbers'])
                ->filter(fn ($n, $id) => in_array((int) $id, $staff, false) && trim((string) $n) !== '')
                ->map(fn ($n) => trim((string) $n))
                ->all()), $company);
        }

        return $this->settings($request);
    }

    /**
     * Exotel's status callback for click-to-call. Always 200 once the token is right, so one bad
     * event doesn't make Exotel retry.
     */
    public function status(Request $request, int $company, string $token): Response
    {
        abort_unless($this->validToken($company, $token), 403);
        try {
            $this->exotel->handleStatus($company, $request->all());
        } catch (Throwable $e) {
            Log::error('Exotel status webhook failed', ['company' => $company, 'error' => $e->getMessage()]);
        }

        return response('OK');
    }

    /**
     * Passthru applet of the ExoPhone's incoming call flow (Exotel sends a GET).
     */
    public function incoming(Request $request, int $company, string $token): Response
    {
        abort_unless($this->validToken($company, $token), 403);
        try {
            $this->exotel->handleIncoming($company, $request->all());
        } catch (Throwable $e) {
            Log::error('Exotel incoming webhook failed', ['company' => $company, 'error' => $e->getMessage()]);
        }

        return response('OK');
    }

    private function validToken(int $company, string $token): bool
    {
        $expected = Options::get('calls_webhook_token', $company);

        return $expected !== '' && hash_equals($expected, $token);
    }

    private function admin(Request $request): int
    {
        abort_unless($request->user()->isAdmin(), 403);

        return (int) $request->user()->company_id;
    }
}
