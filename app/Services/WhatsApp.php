<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\User;
use App\Models\WhatsappMessage;
use App\Support\PhoneNumber;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * WhatsApp with leads, through the company's own WhatsApp Business number in Setup → WhatsApp:
 * either directly on Meta's Cloud API, or through a Bird workspace (app.bird.com, Channels API)
 * when the number is installed as a Bird WhatsApp channel. Replies come back to the company's
 * webhook for that provider.
 *
 * WhatsApp only allows free text within 24 hours of the lead's last message. Outside that
 * window the conversation has to be opened with an approved template.
 */
class WhatsApp
{
    /** Settings saved as plain options; the token and app secret are stored encrypted. */
    public const KEYS = [
        'whatsapp_provider', 'whatsapp_phone_number_id', 'whatsapp_verify_token', 'whatsapp_bird_workspace_id', 'whatsapp_bird_channel_id',
        'whatsapp_country_code', 'whatsapp_template_name', 'whatsapp_template_language', 'whatsapp_template_lead_name',
        'whatsapp_bird_template_version', 'whatsapp_bird_template_param',
    ];

    /** Bird message statuses (whatsapp.outbound events) => our message status. */
    private const BIRD_STATUSES = [
        'sent' => 'sent', 'delivered' => 'delivered', 'read' => 'read',
        'sending_failed' => 'failed', 'delivery_failed' => 'failed', 'rejected' => 'failed',
    ];

    /** Receipts only move a message forward (a late "delivered" never undoes "read"). */
    private const STATUS_RANK = ['pending' => 0, 'sent' => 1, 'delivered' => 2, 'read' => 3, 'failed' => 4];

    public function __construct(private Notifier $notifier) {}

    public static function bird(int $companyId): bool
    {
        return Options::get('whatsapp_provider', $companyId) === 'bird';
    }

    public static function configured(int $companyId): bool
    {
        return self::bird($companyId)
            ? Options::get('whatsapp_bird_workspace_id', $companyId) !== '' && Options::get('whatsapp_bird_channel_id', $companyId) !== ''
                && Options::secret('whatsapp_bird_access_key', $companyId) !== ''
            : Options::get('whatsapp_phone_number_id', $companyId) !== '' && Options::secret('whatsapp_access_token', $companyId) !== '';
    }

    /**
     * A lead's phone as WhatsApp wants it, with the company's default country code.
     */
    public static function normalize(?string $phone, int $companyId): ?string
    {
        return PhoneNumber::normalize($phone, Options::get('whatsapp_country_code', $companyId));
    }

    /**
     * Until when free text may be sent to this number (24 hours after the lead's last message),
     * or null when the window is closed.
     */
    public static function windowEndsAt(string $waId, int $companyId): ?Carbon
    {
        $last = WhatsappMessage::withoutGlobalScopes()->where('company_id', $companyId)->where('wa_id', $waId)->where('direction', 'in')->max('created_at');
        $ends = $last ? Carbon::parse($last)->addDay() : null;

        return $ends?->isFuture() ? $ends : null;
    }

    public function sendText(Lead $lead, string $body, User $user): WhatsappMessage
    {
        return $this->send($lead, $user, ['type' => 'text', 'body' => $body], 'text', ['preview_url' => true, 'body' => $body]);
    }

    /**
     * The company's approved opening template (Setup → WhatsApp), optionally with the lead's
     * name as its {{1}}.
     */
    public function sendTemplate(Lead $lead, User $user): WhatsappMessage
    {
        $company = (int) $lead->company_id;
        $name = Options::get('whatsapp_template_name', $company);
        $language = Options::get('whatsapp_template_language', $company) ?: 'en_US';
        $components = Options::get('whatsapp_template_lead_name', $company) === '1'
            ? [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $lead->name]]]]
            : [];
        // Bird templates are Studio projects: the template's project id, version and locale, with
        // named parameters.
        $template = self::bird($company)
            ? array_filter([
                'projectId' => $name,
                'version' => Options::get('whatsapp_bird_template_version', $company),
                'locale' => str_replace('_', '-', $language),
                'parameters' => Options::get('whatsapp_template_lead_name', $company) === '1'
                    ? [['type' => 'string', 'key' => Options::get('whatsapp_bird_template_param', $company) ?: 'name', 'value' => $lead->name]]
                    : [],
            ])
            : array_filter(['name' => $name, 'language' => ['code' => $language], 'components' => $components]);

        return $this->send($lead, $user, ['type' => 'template', 'template' => $name, 'body' => "Template: {$name}"], 'template', $template);
    }

    /**
     * Save the message, send it right away (so an error shows on the screen) and keep the
     * result on the message: sent with WhatsApp's id, or failed with the reason.
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, mixed>  $content  the text or template object, as the provider wants it
     */
    private function send(Lead $lead, User $user, array $row, string $kind, array $content): WhatsappMessage
    {
        $company = (int) $lead->company_id;
        $to = (string) self::normalize($lead->phone, $company);

        $message = WhatsappMessage::create([
            ...$row,
            'company_id' => $company,
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'direction' => 'out',
            'wa_id' => $to,
            'status' => 'pending',
        ]);

        try {
            if (self::bird($company)) {
                // Bird accepts the message (202) and reports delivery through its webhook.
                $response = Http::baseUrl('https://api.bird.com')
                    ->withHeaders(['Authorization' => 'AccessKey '.Options::secret('whatsapp_bird_access_key', $company)])
                    ->acceptJson()
                    ->timeout(20)
                    ->post('/workspaces/'.Options::get('whatsapp_bird_workspace_id', $company).'/channels/'.Options::get('whatsapp_bird_channel_id', $company).'/messages', [
                        'receiver' => ['contacts' => [['identifierValue' => '+'.$to]]],
                        ...($kind === 'text' ? ['body' => ['type' => 'text', 'text' => ['text' => $content['body']]]] : ['template' => $content]),
                        'reference' => "lead-{$lead->id}",
                    ]);
                $id = $response->json('id');
                $error = self::birdErrorText($response->json());
            } else {
                $response = Http::baseUrl(rtrim((string) config('services.whatsapp.graph_url'), '/'))
                    ->withToken(Options::secret('whatsapp_access_token', $company))
                    ->acceptJson()
                    ->timeout(20)
                    ->post('/'.Options::get('whatsapp_phone_number_id', $company).'/messages', [
                        'messaging_product' => 'whatsapp',
                        'recipient_type' => 'individual',
                        'to' => $to,
                        'type' => $kind,
                        $kind => $content,
                    ]);
                $id = $response->json('messages.0.id');
                $error = self::errorText($response->json('error'));
            }

            if ($response->successful() && $id) {
                $message->update(['status' => 'sent', 'wamid' => $id]);
                $lead->update(['last_contact_at' => now()]);
            } else {
                $message->update(['status' => 'failed', 'error' => $error ?? "WhatsApp returned HTTP {$response->status()}."]);
            }
        } catch (ConnectionException $e) {
            $message->update(['status' => 'failed', 'error' => 'Could not reach WhatsApp: '.$e->getMessage()]);
        }

        return $message;
    }

    /**
     * Whether a webhook call really comes from Meta: signed with the company's app secret.
     * Without an app secret saved the check is skipped.
     */
    public static function validSignature(int $companyId, string $raw, ?string $header): bool
    {
        $secret = Options::secret('whatsapp_app_secret', $companyId);

        return $secret === '' || hash_equals('sha256='.hash_hmac('sha256', $raw, $secret), (string) $header);
    }

    /**
     * Webhook from Meta: new messages from leads and delivery / read receipts for ours.
     *
     * @param  array<string, mixed>  $payload
     */
    public function handleWebhook(int $companyId, array $payload): void
    {
        $phoneNumberId = Options::get('whatsapp_phone_number_id', $companyId);

        foreach ((array) ($payload['entry'] ?? []) as $entry) {
            foreach ((array) ($entry['changes'] ?? []) as $change) {
                $value = (array) ($change['value'] ?? []);
                // Only events for this company's own WhatsApp number.
                if ((string) data_get($value, 'metadata.phone_number_id') !== $phoneNumberId) {
                    continue;
                }
                foreach ((array) ($value['messages'] ?? []) as $m) {
                    $type = (string) ($m['type'] ?? 'text');
                    $this->receive(
                        $companyId,
                        preg_replace('/\D/', '', (string) ($m['from'] ?? '')),
                        (string) ($m['id'] ?? ''),
                        $type,
                        self::incomingText($type, (array) $m),
                        isset($m['timestamp']) ? Carbon::createFromTimestamp((int) $m['timestamp']) : now(),
                    );
                }
                foreach ((array) ($value['statuses'] ?? []) as $st) {
                    $status = (string) ($st['status'] ?? '');
                    $this->receipt($companyId, (string) ($st['id'] ?? ''), $status, $status === 'failed' ? self::errorText(data_get($st, 'errors.0')) : null);
                }
            }
        }
    }

    /**
     * The signing key Bird's webhook subscriptions sign with, made on first use.
     */
    public static function birdSigningKey(int $companyId): string
    {
        $key = Options::secret('whatsapp_bird_signing_key', $companyId);
        if ($key === '') {
            $key = Str::random(40);
            Options::setSecret('whatsapp_bird_signing_key', $key, $companyId);
        }

        return $key;
    }

    /**
     * Whether a webhook call really comes from Bird: the messagebird-signature header is the
     * base64 HMAC-SHA256, with the subscription's signing key, of
     * "{messagebird-request-timestamp}\n{request URL}\n{binary SHA-256 of the body}".
     *
     * @param  array<int, string>  $urls  the URL as received and as registered (proxies may change one)
     */
    public static function validBirdSignature(int $companyId, string $raw, array $urls, ?string $timestamp, ?string $signature): bool
    {
        $key = Options::secret('whatsapp_bird_signing_key', $companyId);
        $decoded = base64_decode((string) $signature, true);
        if ($key === '' || ! $timestamp || $decoded === false) {
            return false;
        }
        $bodyHash = hash('sha256', $raw, true);
        foreach (array_unique($urls) as $url) {
            if (hash_equals(hash_hmac('sha256', "{$timestamp}\n{$url}\n{$bodyHash}", $key, true), $decoded)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Webhook from Bird: whatsapp.inbound (a lead's message) and whatsapp.outbound (the status of
     * ours), for this company's WhatsApp channel only.
     *
     * @param  array<string, mixed>  $event
     */
    public function handleBirdWebhook(int $companyId, array $event): void
    {
        $type = (string) ($event['event'] ?? '');
        $p = (array) ($event['payload'] ?? []);
        if (isset($p['channelId']) && (string) $p['channelId'] !== Options::get('whatsapp_bird_channel_id', $companyId)) {
            return;
        }

        if ($type === 'whatsapp.inbound') {
            $kind = (string) data_get($p, 'body.type', 'text');
            $this->receive(
                $companyId,
                preg_replace('/\D/', '', (string) data_get($p, 'sender.contact.identifierValue')),
                (string) ($p['id'] ?? ''),
                $kind,
                self::birdIncomingText($kind, (array) ($p['body'] ?? [])),
                isset($p['createdAt']) ? Carbon::parse((string) $p['createdAt']) : now(),
            );
        } elseif ($type === 'whatsapp.outbound' && isset(self::BIRD_STATUSES[$p['status'] ?? ''])) {
            $reason = trim((string) ($p['reason'] ?? ''));
            $this->receipt($companyId, (string) ($p['id'] ?? ''), self::BIRD_STATUSES[$p['status']], $reason !== '' ? $reason : null);
        }
    }

    /**
     * A lead's message: kept once (providers retry webhooks), filed under the lead with that
     * number, and the lead's staff told.
     */
    private function receive(int $companyId, string $waId, string $wamid, string $type, string $body, Carbon $at): void
    {
        if ($waId === '' || $wamid === '' || WhatsappMessage::withoutGlobalScopes()->where('wamid', $wamid)->exists()) {
            return;
        }

        $lead = $this->leadFor($companyId, $waId);

        WhatsappMessage::create([
            'company_id' => $companyId,
            'lead_id' => $lead?->id,
            'direction' => 'in',
            'wa_id' => $waId,
            'wamid' => $wamid,
            'type' => $type,
            'body' => $body,
            'status' => 'received',
            'created_at' => $at,
        ]);

        if ($lead) {
            $staff = array_filter([$lead->assigned_id ?: $lead->created_by]);
            $this->notifier->notify($staff, "New WhatsApp message from lead {$lead->name}", "/leads?lead={$lead->id}", $companyId);
            Realtime::toUsers(array_unique(array_filter([
                $lead->assigned_id,
                $lead->created_by,
                ...WhatsappMessage::withoutGlobalScopes()->where('lead_id', $lead->id)->whereNotNull('user_id')->distinct()->pluck('user_id')->all(),
            ])), 'whatsapp', ['lead' => $lead->id]);
        }
    }

    /**
     * A delivery receipt for one of our messages.
     */
    private function receipt(int $companyId, string $wamid, string $status, ?string $error): void
    {
        $message = $wamid === '' ? null : WhatsappMessage::withoutGlobalScopes()->where('company_id', $companyId)->where('wamid', $wamid)->first();
        if (! $message || ! isset(self::STATUS_RANK[$status]) || self::STATUS_RANK[$status] <= (self::STATUS_RANK[$message->status] ?? 0)) {
            return;
        }

        $message->update(['status' => $status, 'error' => $status === 'failed' ? ($error ?: 'WhatsApp did not deliver the message.') : $message->error]);
        if ($message->lead_id) {
            Realtime::toUsers([$message->user_id], 'whatsapp', ['lead' => $message->lead_id]);
        }
    }

    /**
     * The lead a number belongs to: the lead already chatting from it, otherwise the newest lead
     * whose phone is that number.
     */
    private function leadFor(int $companyId, string $waId): ?Lead
    {
        $known = WhatsappMessage::withoutGlobalScopes()->where('company_id', $companyId)->where('wa_id', $waId)->whereNotNull('lead_id')->latest('id')->value('lead_id');
        if ($known && ($lead = Lead::withoutGlobalScopes()->find($known))) {
            return $lead;
        }

        return PhoneNumber::findLead($companyId, $waId, Options::get('whatsapp_country_code', $companyId));
    }

    /**
     * @param  array<string, mixed>  $m
     */
    private static function incomingText(string $type, array $m): string
    {
        return match ($type) {
            'text' => (string) data_get($m, 'text.body'),
            'button' => (string) data_get($m, 'button.text'),
            'interactive' => (string) (data_get($m, 'interactive.button_reply.title') ?? data_get($m, 'interactive.list_reply.title')),
            'reaction' => 'Reacted '.data_get($m, 'reaction.emoji'),
            'location' => 'Location: '.data_get($m, 'location.latitude').', '.data_get($m, 'location.longitude'),
            'image', 'video', 'document', 'audio', 'sticker' => trim('['.ucfirst($type).'] '.data_get($m, "{$type}.caption", data_get($m, "{$type}.filename", ''))),
            default => '['.ucfirst($type).' message]',
        };
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private static function birdIncomingText(string $kind, array $body): string
    {
        return match ($kind) {
            'text' => (string) data_get($body, 'text.text'),
            'location' => 'Location: '.data_get($body, 'location.coordinates.latitude').', '.data_get($body, 'location.coordinates.longitude'),
            'image', 'file', 'video', 'audio' => trim('['.ucfirst($kind).'] '.(data_get($body, "{$kind}.text") ?? data_get($body, "{$kind}.images.0.altText") ?? data_get($body, "{$kind}.files.0.altText") ?? '')),
            default => '['.ucfirst($kind).' message]',
        };
    }

    /**
     * Bird's error reply, as problem details or an error object.
     */
    private static function birdErrorText(mixed $body): ?string
    {
        if (! is_array($body)) {
            return null;
        }
        $text = $body['message'] ?? data_get($body, 'error.message') ?? $body['detail'] ?? $body['title'] ?? null;
        $code = $body['code'] ?? data_get($body, 'error.code') ?? null;
        $details = collect((array) ($body['details'] ?? []))->flatten()->filter(fn ($d) => is_string($d))->implode('; ');
        $text = $text && $details !== '' ? "{$text}: {$details}" : $text;

        return $text ? trim($text.($code ? " ({$code})" : '')) : null;
    }

    private static function errorText(mixed $error): ?string
    {
        if (! is_array($error)) {
            return null;
        }
        $text = trim(($error['message'] ?? $error['title'] ?? '').' '.(data_get($error, 'error_data.details') ?? ''));

        return $text === '' ? null : $text.(isset($error['code']) ? " (code {$error['code']})" : '');
    }
}
