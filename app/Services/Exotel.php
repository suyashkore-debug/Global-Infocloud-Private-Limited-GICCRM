<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\LeadCall;
use App\Models\User;
use App\Support\PhoneNumber;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * Calls with leads through Exotel (Setup → Calls). "Call now" rings the staff member's mobile
 * first, then connects the lead, who sees the company's ExoPhone. Exotel reports every call
 * back to the CRM — outgoing ones to the status webhook, incoming ones through a Passthru
 * applet in the ExoPhone's call flow — and the call is logged on the lead with its talk time and
 * recording.
 */
class Exotel
{
    /** Settings saved as plain options; the API key and token are stored encrypted. */
    public const KEYS = ['calls_provider', 'calls_exotel_subdomain', 'calls_exotel_sid', 'calls_caller_id', 'calls_record', 'calls_country_code'];

    /** Hosts recordings may be fetched from (Exotel stores them on its own and AWS hosts). */
    private const RECORDING_HOSTS = ['exotel.com', 'exotel.in', 'amazonaws.com'];

    public function __construct(private Notifier $notifier) {}

    public static function configured(int $companyId): bool
    {
        return Options::get('calls_provider', $companyId) === 'exotel'
            && Options::get('calls_exotel_sid', $companyId) !== ''
            && Options::get('calls_caller_id', $companyId) !== ''
            && Options::secret('calls_exotel_api_key', $companyId) !== ''
            && Options::secret('calls_exotel_api_token', $companyId) !== '';
    }

    public static function normalize(?string $phone, int $companyId): ?string
    {
        return PhoneNumber::normalize($phone, Options::get('calls_country_code', $companyId));
    }

    /**
     * Staff mobile numbers set in Setup → Calls, by user id. Staff not listed use the mobile
     * number from their HRMS profile.
     *
     * @return array<int, string>
     */
    public static function staffNumbers(int $companyId): array
    {
        $map = json_decode(Options::get('calls_staff_numbers', $companyId), true);

        return is_array($map) ? collect($map)->mapWithKeys(fn ($n, $id) => [(int) $id => (string) $n])->filter()->all() : [];
    }

    public static function numberFor(User $user): ?string
    {
        $company = (int) $user->company_id;

        return self::normalize(self::staffNumbers($company)[$user->id] ?? $user->mobile, $company);
    }

    /**
     * The staff member a number belongs to (who answered an incoming call).
     */
    public static function userForNumber(int $companyId, ?string $number): ?User
    {
        $number = self::normalize($number, $companyId);
        if (! $number) {
            return null;
        }
        foreach (self::staffNumbers($companyId) as $id => $n) {
            if (self::normalize($n, $companyId) === $number) {
                return User::where('company_id', $companyId)->find($id);
            }
        }

        return User::where('company_id', $companyId)->where('is_active', true)->whereNotNull('mobile')
            ->where('mobile', 'like', '%'.substr($number, -4).'%')->get()
            ->first(fn (User $u) => self::normalize($u->mobile, $companyId) === $number);
    }

    /**
     * The secret in the webhook URLs (Exotel does not sign its calls), made on first use.
     */
    public static function webhookToken(int $companyId): string
    {
        $token = Options::get('calls_webhook_token', $companyId);
        if ($token === '') {
            $token = Str::random(40);
            Options::set('calls_webhook_token', $token, $companyId);
        }

        return $token;
    }

    public static function statusUrl(int $companyId): string
    {
        return url("/api/calls/exotel/{$companyId}/".self::webhookToken($companyId).'/status');
    }

    public static function incomingUrl(int $companyId): string
    {
        return url("/api/calls/exotel/{$companyId}/".self::webhookToken($companyId).'/incoming');
    }

    /**
     * Click-to-call: Exotel rings the staff member, then the lead. The call is logged at once as
     * "Calling…" and completed by the status webhook.
     *
     * @throws RuntimeException with a message for the user
     */
    public function dial(Lead $lead, User $user): LeadCall
    {
        $company = (int) $lead->company_id;
        $to = self::normalize($lead->phone, $company);
        $from = self::numberFor($user);
        if (! $to) {
            throw new RuntimeException('This lead has no phone number.');
        }
        if (! $from) {
            throw new RuntimeException('Your mobile number is not set. Ask an admin to add it in Setup → Calls.');
        }

        try {
            $response = $this->client($company)->asForm()->post('/v1/Accounts/'.Options::get('calls_exotel_sid', $company).'/Calls/connect.json', [
                'From' => '+'.$from,
                'To' => '+'.$to,
                'CallerId' => Options::get('calls_caller_id', $company),
                'CallType' => 'trans',
                'Record' => Options::get('calls_record', $company) === '1' ? 'true' : 'false',
                'StatusCallback' => self::statusUrl($company),
                'StatusCallbackEvents[0]' => 'terminal',
                'StatusCallbackContentType' => 'application/json',
                'CustomField' => "lead:{$lead->id}",
            ]);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Could not reach Exotel: '.$e->getMessage());
        }

        $sid = $response->json('Call.Sid');
        if (! $response->successful() || ! $sid) {
            throw new RuntimeException('Exotel did not place the call: '.($response->json('RestException.Message') ?? "HTTP {$response->status()}"));
        }

        return LeadCall::create([
            'company_id' => $company,
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'source' => 'exotel',
            'provider_call_id' => $sid,
            'provider_status' => $response->json('Call.Status'),
            'lead_number' => $to,
            'agent_number' => $from,
            'direction' => 'out',
            'outcome' => 'calling',
            'called_at' => now(),
        ]);
    }

    /**
     * Exotel's status callback when a click-to-call ends.
     *
     * @param  array<string, mixed>  $p
     */
    public function handleStatus(int $companyId, array $p): void
    {
        $call = LeadCall::withoutGlobalScopes()->where('company_id', $companyId)->where('provider_call_id', (string) ($p['CallSid'] ?? ''))->first();
        if (! $call) {
            return;
        }

        $status = (string) ($p['Status'] ?? '');
        $talk = (int) ($p['ConversationDuration'] ?? 0);
        $call->update([
            'provider_status' => $status ?: $call->provider_status,
            // "completed" with no conversation = the staff member answered but the lead didn't.
            'outcome' => match ($status) {
                'completed' => $talk > 0 ? 'answered' : 'no_answer',
                'busy' => 'busy',
                'no-answer' => 'no_answer',
                'failed', 'canceled' => 'failed',
                default => $call->outcome,
            },
            'talk_seconds' => $talk ?: null,
            'duration_minutes' => $talk ? (int) ceil($talk / 60) : null,
            'recording_url' => self::recordingUrl($p['RecordingUrl'] ?? null) ?? $call->recording_url,
        ]);

        $this->afterCall($call);
    }

    /**
     * Exotel Passthru applet at the end of the ExoPhone's incoming call flow: the call is logged
     * on the lead with that number (or kept without a lead), and a missed call is notified.
     *
     * @param  array<string, mixed>  $p
     */
    public function handleIncoming(int $companyId, array $p): void
    {
        $sid = (string) ($p['CallSid'] ?? '');
        $number = self::normalize((string) ($p['CallFrom'] ?? ''), $companyId);
        if ($sid === '' || ! $number) {
            return;
        }

        $answered = ($p['DialCallStatus'] ?? '') === 'completed' || ($p['CallType'] ?? '') === 'completed';
        $talk = (int) ($p['DialCallDuration'] ?? 0);
        $agent = self::userForNumber($companyId, $p['DialWhomNumber'] ?? null);
        $lead = PhoneNumber::findLead($companyId, $number, Options::get('calls_country_code', $companyId));

        $call = LeadCall::withoutGlobalScopes()->updateOrCreate(['provider_call_id' => $sid], [
            'company_id' => $companyId,
            'lead_id' => $lead?->id,
            'user_id' => $agent?->id,
            'source' => 'exotel',
            'provider_status' => (string) ($p['DialCallStatus'] ?? $p['CallType'] ?? ''),
            'lead_number' => $number,
            'agent_number' => self::normalize($p['DialWhomNumber'] ?? null, $companyId),
            'direction' => 'in',
            'outcome' => $answered ? 'answered' : 'missed',
            'called_at' => self::time($p['StartTime'] ?? null),
            'talk_seconds' => $talk ?: null,
            'duration_minutes' => $talk ? (int) ceil($talk / 60) : null,
            'recording_url' => self::recordingUrl($p['RecordingUrl'] ?? null),
        ]);

        $this->afterCall($call);

        if (! $answered && $call->wasRecentlyCreated) {
            $to = $lead
                ? [$lead->assigned_id ?: $lead->created_by]
                : ($agent ? [$agent->id] : User::where('company_id', $companyId)->where('is_company_admin', true)->pluck('id')->all());
            $this->notifier->notify(array_filter($to), $lead ? "Missed call from lead {$lead->name}" : "Missed call from +{$number}", $lead ? "/leads?lead={$lead->id}" : '/leads', $companyId);
        }
    }

    /**
     * The recording, fetched with the company's Exotel credentials (recordings may need them).
     */
    public function recording(LeadCall $call): ?string
    {
        if (! self::recordingUrl($call->recording_url)) {
            return null;
        }
        try {
            $response = Http::withBasicAuth(Options::secret('calls_exotel_api_key', (int) $call->company_id), Options::secret('calls_exotel_api_token', (int) $call->company_id))
                ->timeout(30)->get($call->recording_url);
        } catch (Throwable) {
            return null;
        }

        return $response->successful() ? $response->body() : null;
    }

    /**
     * A finished call that reached the lead counts as contact; every finished call goes in the
     * lead's activity log.
     */
    private function afterCall(LeadCall $call): void
    {
        $lead = $call->lead_id ? Lead::withoutGlobalScopes()->find($call->lead_id) : null;
        if (! $lead || $call->outcome === 'calling') {
            return;
        }
        if ($call->outcome === 'answered' && (! $lead->last_contact_at || $call->called_at->gt($lead->last_contact_at))) {
            $lead->update(['last_contact_at' => $call->called_at]);
        }
        $talk = $call->talk_seconds ? ' ('.intdiv($call->talk_seconds, 60).' min '.($call->talk_seconds % 60).' s)' : '';
        $lead->activities()->create([
            'user_id' => $call->user_id,
            'description' => ($call->direction === 'in' ? 'Incoming call: ' : 'Outgoing call: ').LeadCall::labels()[$call->outcome].$talk,
            'custom' => false,
        ]);
    }

    private function client(int $companyId): PendingRequest
    {
        return Http::baseUrl('https://'.(Options::get('calls_exotel_subdomain', $companyId) ?: 'api.exotel.com'))
            ->withBasicAuth(Options::secret('calls_exotel_api_key', $companyId), Options::secret('calls_exotel_api_token', $companyId))
            ->acceptJson()
            ->timeout(20);
    }

    /**
     * Only https recordings on Exotel's hosts are kept and fetched.
     */
    private static function recordingUrl(mixed $url): ?string
    {
        $url = is_string($url) ? trim($url) : '';
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($url === '' || parse_url($url, PHP_URL_SCHEME) !== 'https') {
            return null;
        }
        foreach (self::RECORDING_HOSTS as $allowed) {
            if ($host === $allowed || str_ends_with($host, ".{$allowed}")) {
                return $url;
            }
        }

        return null;
    }

    /**
     * Exotel reports times in India time ("2026-10-28 14:05:00").
     */
    private static function time(mixed $value): Carbon
    {
        try {
            return is_string($value) && $value !== '' ? Carbon::parse($value, 'Asia/Kolkata')->utc() : now();
        } catch (Throwable) {
            return now();
        }
    }
}
