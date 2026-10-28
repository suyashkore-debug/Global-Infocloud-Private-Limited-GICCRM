<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\WhatsappMessage;
use App\Services\Options;
use App\Services\WhatsApp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The WhatsApp tab of a lead (send messages, see replies), Setup → WhatsApp, and the public
 * webhook Meta calls with replies and delivery receipts.
 */
class WhatsAppController extends Controller
{
    public function __construct(private WhatsApp $whatsapp) {}

    /**
     * The conversation with a lead, oldest first. Opening it marks the lead's replies as read.
     */
    public function index(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('view', $lead);
        $company = (int) $lead->company_id;
        $waId = WhatsApp::normalize($lead->phone, $company);

        $messages = WhatsappMessage::with('user')->where('lead_id', $lead->id)->orderBy('created_at')->orderBy('id')->limit(500)->get();
        WhatsappMessage::where('lead_id', $lead->id)->where('direction', 'in')->whereNull('read_at')->update(['read_at' => now()]);
        $windowEnds = $waId ? WhatsApp::windowEndsAt($waId, $company) : null;

        return response()->json([
            'data' => $messages->map(fn (WhatsappMessage $m) => [
                'id' => $m->id,
                'direction' => $m->direction,
                'type' => $m->type,
                'body' => $m->body,
                'status' => $m->status,
                'error' => $m->error,
                'user' => $m->user?->full_name,
                'created_at' => $m->created_at,
            ]),
            'meta' => [
                'configured' => WhatsApp::configured($company),
                'to' => $waId,
                'window_open' => $windowEnds !== null,
                'window_ends_at' => $windowEnds,
                'template_name' => Options::get('whatsapp_template_name', $company),
                'can_send' => $request->user()->can('update', $lead),
            ],
        ]);
    }

    /**
     * Send a text message, or (template = true) the company's opening template.
     */
    public function send(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);
        $company = (int) $lead->company_id;
        $data = $request->validate([
            'template' => ['boolean'],
            'body' => ['required_unless:template,true', 'nullable', 'string', 'max:4096'],
        ]);

        abort_unless(WhatsApp::configured($company), 422, 'WhatsApp is not set up yet. An admin can connect it in Setup → WhatsApp.');
        abort_unless(WhatsApp::normalize($lead->phone, $company), 422, 'This lead has no phone number.');

        $template = (bool) ($data['template'] ?? false);
        abort_if($template && Options::get('whatsapp_template_name', $company) === '', 422, 'No opening template is set in Setup → WhatsApp.');

        $message = $template
            ? $this->whatsapp->sendTemplate($lead, $request->user())
            : $this->whatsapp->sendText($lead, trim((string) $data['body']), $request->user());

        if ($message->status === 'failed') {
            return response()->json(['message' => 'WhatsApp did not send the message: '.$message->error], 422);
        }

        return response()->json(['message' => 'Message sent.'], 201);
    }

    public function settings(Request $request): JsonResponse
    {
        $company = $this->admin($request);

        return response()->json(['data' => [
            ...collect(WhatsApp::KEYS)->mapWithKeys(fn ($k) => [$k => Options::get($k, $company)])->all(),
            'has_access_token' => Options::secret('whatsapp_access_token', $company) !== '',
            'has_app_secret' => Options::secret('whatsapp_app_secret', $company) !== '',
            'webhook_url' => url("/api/whatsapp/webhook/{$company}"),
            'has_bird_access_key' => Options::secret('whatsapp_bird_access_key', $company) !== '',
            'bird_webhook_url' => url("/api/whatsapp/bird/{$company}"),
            // Typed into Bird's webhook subscription, so admins see it.
            'bird_signing_key' => WhatsApp::birdSigningKey($company),
        ]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $data = $request->validate([
            'whatsapp_provider' => ['nullable', 'in:meta,bird'],
            'whatsapp_phone_number_id' => ['nullable', 'string', 'max:64', 'regex:/^\d*$/'],
            'whatsapp_bird_workspace_id' => ['nullable', 'uuid'],
            'whatsapp_bird_channel_id' => ['nullable', 'uuid'],
            'whatsapp_bird_template_version' => ['nullable', 'string', 'max:100'],
            'whatsapp_bird_template_param' => ['nullable', 'string', 'max:100'],
            'whatsapp_bird_access_key' => ['nullable', 'string', 'max:500'],
            'whatsapp_verify_token' => ['nullable', 'string', 'max:191'],
            'whatsapp_country_code' => ['nullable', 'string', 'max:5', 'regex:/^\d*$/'],
            'whatsapp_template_name' => ['nullable', 'string', 'max:191'],
            'whatsapp_template_language' => ['nullable', 'string', 'max:20'],
            'whatsapp_template_lead_name' => ['nullable', 'in:0,1'],
            'whatsapp_access_token' => ['nullable', 'string', 'max:2000'],
            'whatsapp_app_secret' => ['nullable', 'string', 'max:191'],
            'clear_access_token' => ['boolean'],
        ]);

        foreach (WhatsApp::KEYS as $key) {
            if (array_key_exists($key, $data)) {
                Options::set($key, trim((string) ($data[$key] ?? '')), $company);
            }
        }
        foreach (['whatsapp_access_token', 'whatsapp_app_secret', 'whatsapp_bird_access_key'] as $key) {
            if (! empty($data[$key])) {
                Options::setSecret($key, trim($data[$key]), $company);
            }
        }
        if ($data['clear_access_token'] ?? false) {
            foreach (['whatsapp_access_token', 'whatsapp_app_secret', 'whatsapp_bird_access_key'] as $key) {
                Options::setSecret($key, '', $company);
            }
        }

        return $this->settings($request);
    }

    /**
     * Meta checks the webhook URL once when it is saved in the Meta app: echo the challenge back
     * when the verify token matches the company's.
     */
    public function verify(Request $request, int $company): Response
    {
        $token = Options::get('whatsapp_verify_token', $company);
        $ok = $request->query('hub_mode') === 'subscribe' && $token !== '' && hash_equals($token, (string) $request->query('hub_verify_token'));

        return response($ok ? (string) $request->query('hub_challenge') : 'Forbidden', $ok ? 200 : 403);
    }

    /**
     * Messages and receipts from Meta. Always answers 200 once the signature is right, so Meta
     * doesn't keep retrying because of one bad event.
     */
    public function webhook(Request $request, int $company): Response
    {
        if (! WhatsApp::configured($company) || ! WhatsApp::validSignature($company, $request->getContent(), $request->header('X-Hub-Signature-256'))) {
            return response('Forbidden', 403);
        }

        try {
            $this->whatsapp->handleWebhook($company, (array) $request->json()->all());
        } catch (Throwable $e) {
            Log::error('WhatsApp webhook failed', ['company' => $company, 'error' => $e->getMessage()]);
        }

        return response('OK');
    }

    /**
     * Bird's webhook subscriptions (whatsapp.inbound and whatsapp.outbound). Always 200 once the
     * signature is right, so Bird doesn't keep retrying because of one bad event.
     */
    public function birdWebhook(Request $request, int $company): Response
    {
        $raw = $request->getContent();
        $urls = [$request->fullUrl(), url("/api/whatsapp/bird/{$company}")];
        if (! WhatsApp::configured($company) || ! WhatsApp::bird($company)
            || ! WhatsApp::validBirdSignature($company, $raw, $urls, $request->header('messagebird-request-timestamp'), $request->header('messagebird-signature'))) {
            return response('Forbidden', 403);
        }

        try {
            $this->whatsapp->handleBirdWebhook($company, (array) json_decode($raw, true));
        } catch (Throwable $e) {
            Log::error('Bird WhatsApp webhook failed', ['company' => $company, 'error' => $e->getMessage()]);
        }

        return response('OK');
    }

    private function admin(Request $request): int
    {
        abort_unless($request->user()->isAdmin(), 403);

        return (int) $request->user()->company_id;
    }
}
