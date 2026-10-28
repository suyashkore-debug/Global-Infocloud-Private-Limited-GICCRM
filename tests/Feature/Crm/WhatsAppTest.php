<?php

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use App\Models\WhatsappMessage;
use App\Services\DefaultLookups;
use App\Services\Options;
use App\Services\WhatsApp;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/** A lead added by the given staff member (who is left signed in). */
function whatsappLead(User $by, array $overrides = []): Lead
{
    signIn($by);
    DefaultLookups::ensureLeadLists();

    return Lead::create([
        'company_id' => $by->company_id,
        'created_by' => $by->id,
        'name' => 'Ravi Patil',
        'phone' => '98765 43210',
        'lead_status_id' => LeadStatus::where('name', 'New Lead')->value('id'),
        'lead_source_id' => LeadSource::where('name', 'Google')->value('id'),
        ...$overrides,
    ]);
}

function connectWhatsApp(int $companyId, string $appSecret = ''): void
{
    Options::set('whatsapp_phone_number_id', '1065403', $companyId);
    Options::set('whatsapp_verify_token', 'gic-verify', $companyId);
    Options::setSecret('whatsapp_access_token', 'EAAG-token', $companyId);
    Options::setSecret('whatsapp_app_secret', $appSecret, $companyId);
}

/** A Meta webhook body for this company's number. */
function metaWebhook(array $value): array
{
    return ['object' => 'whatsapp_business_account', 'entry' => [['id' => 'WABA', 'changes' => [['field' => 'messages', 'value' => [
        'messaging_product' => 'whatsapp',
        'metadata' => ['display_phone_number' => '15550001111', 'phone_number_id' => '1065403'],
        ...$value,
    ]]]]]];
}

it('normalizes lead numbers to WhatsApp ids with the default country code', function () {
    $company = Company::factory()->create();

    expect(WhatsApp::normalize('98765 43210', $company->id))->toBe('919876543210')
        ->and(WhatsApp::normalize('098765-43210', $company->id))->toBe('919876543210')
        ->and(WhatsApp::normalize('+44 7700 900123', $company->id))->toBe('447700900123')
        ->and(WhatsApp::normalize('0044 7700 900123', $company->id))->toBe('447700900123')
        ->and(WhatsApp::normalize('', $company->id))->toBeNull();
});

it('refuses to send until WhatsApp is set up', function () {
    $admin = companyAdmin();
    signIn($admin);
    $lead = whatsappLead($admin);

    $this->getJson("/api/leads/{$lead->id}/whatsapp")->assertOk()->assertJsonPath('meta.configured', false);
    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['body' => 'Hi'])->assertStatus(422);
});

it('sends the opening template, then free text once the lead has replied', function () {
    Http::fake(['graph.facebook.com/*' => Http::sequence()
        ->push(['messages' => [['id' => 'wamid.T1']]])
        ->push(['messages' => [['id' => 'wamid.T2']]])]);
    $admin = companyAdmin();
    signIn($admin);
    connectWhatsApp($admin->company_id);
    Options::set('whatsapp_template_lead_name', '1', $admin->company_id);
    $lead = whatsappLead($admin);

    $this->getJson("/api/leads/{$lead->id}/whatsapp")->assertJsonPath('meta.to', '919876543210')->assertJsonPath('meta.window_open', false);
    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['template' => true])->assertCreated();

    Http::assertSent(fn (Request $r) => $r->url() === 'https://graph.facebook.com/v21.0/1065403/messages'
        && $r->hasHeader('Authorization', 'Bearer EAAG-token')
        && $r['to'] === '919876543210'
        && $r['template']['name'] === 'hello_world'
        && $r['template']['components'][0]['parameters'][0]['text'] === 'Ravi Patil');

    // The lead replies: the 24-hour window opens and free text goes out.
    WhatsappMessage::create(['company_id' => $admin->company_id, 'lead_id' => $lead->id, 'direction' => 'in', 'wa_id' => '919876543210', 'wamid' => 'wamid.IN', 'body' => 'Yes', 'status' => 'received']);
    $this->getJson("/api/leads/{$lead->id}/whatsapp")->assertJsonPath('meta.window_open', true);
    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['body' => 'Great, sharing details.'])->assertCreated();

    Http::assertSent(fn (Request $r) => ($r['text']['body'] ?? null) === 'Great, sharing details.');
    expect(WhatsappMessage::where('wamid', 'wamid.T2')->value('status'))->toBe('sent')
        ->and($lead->refresh()->last_contact_at)->not->toBeNull();
});

it('keeps a failed message with WhatsApp\'s reason', function () {
    Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['message' => 'Re-engagement message', 'code' => 131047]], 400)]);
    $admin = companyAdmin();
    signIn($admin);
    connectWhatsApp($admin->company_id);
    $lead = whatsappLead($admin);

    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['body' => 'Hi'])->assertStatus(422)->assertJsonFragment(['message' => 'WhatsApp did not send the message: Re-engagement message (code 131047)']);
    $this->getJson("/api/leads/{$lead->id}/whatsapp")->assertJsonPath('data.0.status', 'failed');
});

it('verifies the webhook with the company verify token', function () {
    $company = Company::factory()->create();
    connectWhatsApp($company->id);

    $this->get("/api/whatsapp/webhook/{$company->id}?hub.mode=subscribe&hub.verify_token=gic-verify&hub.challenge=12345")->assertOk()->assertSee('12345');
    $this->get("/api/whatsapp/webhook/{$company->id}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345")->assertForbidden();
});

it('files a reply under the lead with that number, notifies the assignee and applies receipts', function () {
    $admin = companyAdmin();
    $company = $admin->company;
    $sales = staffMember($company);
    connectWhatsApp($company->id);
    $lead = whatsappLead($admin, ['assigned_id' => $sales->id]);
    $other = whatsappLead($admin, ['name' => 'Other', 'phone' => '9000000000']);
    WhatsappMessage::create(['company_id' => $company->id, 'lead_id' => $lead->id, 'user_id' => $sales->id, 'direction' => 'out', 'wa_id' => '919876543210', 'wamid' => 'wamid.OUT', 'body' => 'Hello', 'status' => 'sent']);
    app('auth')->forgetGuards(); // Meta calls the webhook with nobody signed in

    $reply = metaWebhook(['contacts' => [['wa_id' => '919876543210']], 'messages' => [['from' => '919876543210', 'id' => 'wamid.IN1', 'timestamp' => (string) now()->timestamp, 'type' => 'text', 'text' => ['body' => 'Please call me']]]]);
    $this->postJson("/api/whatsapp/webhook/{$company->id}", $reply)->assertOk();
    $this->postJson("/api/whatsapp/webhook/{$company->id}", $reply)->assertOk(); // Meta's retry is ignored

    expect(WhatsappMessage::where('lead_id', $lead->id)->where('direction', 'in')->pluck('body')->all())->toBe(['Please call me'])
        ->and(WhatsappMessage::where('lead_id', $other->id)->count())->toBe(0)
        ->and(AppNotification::where('user_id', $sales->id)->value('link'))->toBe("/leads?lead={$lead->id}");

    $this->postJson("/api/whatsapp/webhook/{$company->id}", metaWebhook(['statuses' => [['id' => 'wamid.OUT', 'status' => 'read', 'recipient_id' => '919876543210']]]))->assertOk();
    $this->postJson("/api/whatsapp/webhook/{$company->id}", metaWebhook(['statuses' => [['id' => 'wamid.OUT', 'status' => 'delivered', 'recipient_id' => '919876543210']]]))->assertOk();
    expect(WhatsappMessage::where('wamid', 'wamid.OUT')->value('status'))->toBe('read');

    signIn($sales);
    $this->getJson("/api/leads/{$lead->id}/whatsapp")->assertJsonPath('data.1.body', 'Please call me')->assertJsonPath('meta.window_open', true);
    expect(WhatsappMessage::where('wamid', 'wamid.IN1')->value('read_at'))->not->toBeNull();
});

it('rejects webhook calls without Meta\'s signature once an app secret is saved', function () {
    $company = Company::factory()->create();
    connectWhatsApp($company->id, 'app-secret');
    $body = json_encode(metaWebhook(['statuses' => []]));

    $this->call('POST', "/api/whatsapp/webhook/{$company->id}", [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_HUB_SIGNATURE_256' => 'sha256=bad'], $body)->assertForbidden();
    $this->call('POST', "/api/whatsapp/webhook/{$company->id}", [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $body, 'app-secret')], $body)->assertOk();
});

it('lets only admins change the WhatsApp settings and never returns the token', function () {
    $admin = companyAdmin();
    signIn(staffMember($admin->company));
    $this->getJson('/api/settings/whatsapp')->assertForbidden();

    signIn($admin);
    $this->putJson('/api/settings/whatsapp', ['whatsapp_phone_number_id' => '1065403', 'whatsapp_access_token' => 'EAAG-token', 'whatsapp_country_code' => '91'])
        ->assertOk()
        ->assertJsonPath('data.has_access_token', true)
        ->assertJsonMissing(['EAAG-token']);
    expect(WhatsApp::configured($admin->company_id))->toBeTrue();
});

function connectBird(int $companyId): void
{
    Options::set('whatsapp_provider', 'bird', $companyId);
    Options::set('whatsapp_bird_workspace_id', '7859b465-7603-46d2-af74-c791e7bc500c', $companyId);
    Options::set('whatsapp_bird_channel_id', '11111111-2222-3333-4444-555555555555', $companyId);
    Options::setSecret('whatsapp_bird_access_key', 'bird-access-key', $companyId);
}

/** POST a Bird webhook event signed the way Bird signs it. */
function postBirdEvent(int $companyId, array $event, ?string $key = null)
{
    $body = json_encode($event);
    $url = url("/api/whatsapp/bird/{$companyId}");
    $at = (string) time();
    $key ??= WhatsApp::birdSigningKey($companyId);
    $signature = base64_encode(hash_hmac('sha256', "{$at}\n{$url}\n".hash('sha256', $body, true), $key, true));

    return test()->call('POST', $url, [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_MESSAGEBIRD_REQUEST_TIMESTAMP' => $at,
        'HTTP_MESSAGEBIRD_SIGNATURE' => $signature,
    ], $body);
}

it('sends through Bird: the opening template, then free text on the company channel', function () {
    Http::fake(['api.bird.com/*' => Http::sequence()
        ->push(['id' => 'b1a1a1a1-0000-0000-0000-000000000001', 'status' => 'accepted'], 202)
        ->push(['id' => 'b1a1a1a1-0000-0000-0000-000000000002', 'status' => 'accepted'], 202)]);
    $admin = companyAdmin();
    signIn($admin);
    connectBird($admin->company_id);
    Options::set('whatsapp_template_name', 'aaaa0000-1111-2222-3333-444455556666', $admin->company_id);
    Options::set('whatsapp_template_language', 'en', $admin->company_id);
    Options::set('whatsapp_bird_template_version', 'v-123', $admin->company_id);
    Options::set('whatsapp_template_lead_name', '1', $admin->company_id);
    $lead = whatsappLead($admin);

    $this->getJson("/api/leads/{$lead->id}/whatsapp")->assertJsonPath('meta.configured', true);
    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['template' => true])->assertCreated();
    WhatsappMessage::create(['company_id' => $admin->company_id, 'lead_id' => $lead->id, 'direction' => 'in', 'wa_id' => '919876543210', 'wamid' => 'in-1', 'body' => 'Yes', 'status' => 'received']);
    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['body' => 'Sharing the brochure.'])->assertCreated();

    $url = 'https://api.bird.com/workspaces/7859b465-7603-46d2-af74-c791e7bc500c/channels/11111111-2222-3333-4444-555555555555/messages';
    Http::assertSent(fn (Request $r) => $r->url() === $url
        && $r->hasHeader('Authorization', 'AccessKey bird-access-key')
        && data_get($r->data(), 'receiver.contacts.0.identifierValue') === '+919876543210'
        && data_get($r->data(), 'template.projectId') === 'aaaa0000-1111-2222-3333-444455556666'
        && data_get($r->data(), 'template.version') === 'v-123'
        && data_get($r->data(), 'template.locale') === 'en'
        && data_get($r->data(), 'template.parameters.0') === ['type' => 'string', 'key' => 'name', 'value' => 'Ravi Patil']);
    Http::assertSent(fn (Request $r) => data_get($r->data(), 'body') === ['type' => 'text', 'text' => ['text' => 'Sharing the brochure.']]);
    expect(WhatsappMessage::where('wamid', 'b1a1a1a1-0000-0000-0000-000000000002')->value('status'))->toBe('sent');
});

it('shows Bird\'s reason when it refuses a message', function () {
    Http::fake(['api.bird.com/*' => Http::response(['code' => 'Forbidden', 'message' => 'access denied'], 403)]);
    $admin = companyAdmin();
    signIn($admin);
    connectBird($admin->company_id);
    $lead = whatsappLead($admin);

    $this->postJson("/api/leads/{$lead->id}/whatsapp", ['body' => 'Hi'])->assertStatus(422)
        ->assertJsonFragment(['message' => 'WhatsApp did not send the message: access denied (Forbidden)']);
});

it('takes Bird webhooks: signed replies filed under the lead, and delivery status', function () {
    $admin = companyAdmin();
    $sales = staffMember($admin->company);
    connectBird($admin->company_id);
    $lead = whatsappLead($admin, ['assigned_id' => $sales->id]);
    WhatsappMessage::create(['company_id' => $admin->company_id, 'lead_id' => $lead->id, 'user_id' => $sales->id, 'direction' => 'out', 'wa_id' => '919876543210', 'wamid' => 'out-1', 'body' => 'Hello', 'status' => 'sent']);
    $channel = '11111111-2222-3333-4444-555555555555';
    app('auth')->forgetGuards();

    $inbound = ['service' => 'channels', 'event' => 'whatsapp.inbound', 'payload' => [
        'id' => 'in-100', 'channelId' => $channel, 'direction' => 'incoming', 'status' => 'delivered',
        'sender' => ['contact' => ['identifierValue' => '+919876543210']],
        'body' => ['type' => 'text', 'text' => ['text' => 'Please call me tomorrow']],
        'createdAt' => now()->toIso8601String(),
    ]];

    $this->postJson("/api/whatsapp/bird/{$admin->company_id}", $inbound)->assertForbidden();
    postBirdEvent($admin->company_id, $inbound, 'wrong-key')->assertForbidden();

    postBirdEvent($admin->company_id, $inbound)->assertOk();
    postBirdEvent($admin->company_id, $inbound)->assertOk(); // Bird's retry is ignored
    // Another channel of the same Bird workspace is not ours.
    postBirdEvent($admin->company_id, ['event' => 'whatsapp.inbound', 'payload' => [...$inbound['payload'], 'id' => 'in-other', 'channelId' => 'another-channel']])->assertOk();

    expect(WhatsappMessage::where('lead_id', $lead->id)->where('direction', 'in')->pluck('body')->all())->toBe(['Please call me tomorrow'])
        ->and(WhatsappMessage::where('wamid', 'in-other')->exists())->toBeFalse()
        ->and(AppNotification::where('user_id', $sales->id)->value('description'))->toBe('New WhatsApp message from lead Ravi Patil');

    postBirdEvent($admin->company_id, ['event' => 'whatsapp.outbound', 'payload' => ['id' => 'out-1', 'channelId' => $channel, 'status' => 'delivered', 'reason' => '']])->assertOk();
    expect(WhatsappMessage::where('wamid', 'out-1')->value('status'))->toBe('delivered');

    WhatsappMessage::create(['company_id' => $admin->company_id, 'lead_id' => $lead->id, 'direction' => 'out', 'wa_id' => '919876543210', 'wamid' => 'out-2', 'body' => 'Late', 'status' => 'sent']);
    postBirdEvent($admin->company_id, ['event' => 'whatsapp.outbound', 'payload' => ['id' => 'out-2', 'channelId' => $channel, 'status' => 'delivery_failed', 'reason' => 'Message failed to send because more than 24 hours have passed since the customer last replied']])->assertOk();
    $failed = WhatsappMessage::where('wamid', 'out-2')->first();
    expect($failed->status)->toBe('failed')
        ->and($failed->error)->toBe('Message failed to send because more than 24 hours have passed since the customer last replied');
});

it('shows admins the Bird webhook URL and signing key', function () {
    $admin = companyAdmin();
    signIn($admin);
    $key = $this->putJson('/api/settings/whatsapp', [
        'whatsapp_provider' => 'bird',
        'whatsapp_bird_workspace_id' => '7859b465-7603-46d2-af74-c791e7bc500c',
        'whatsapp_bird_channel_id' => '11111111-2222-3333-4444-555555555555',
        'whatsapp_bird_access_key' => 'bird-access-key',
    ])->assertOk()
        ->assertJsonPath('data.has_bird_access_key', true)
        ->assertJsonMissing(['bird-access-key'])
        ->json('data.bird_signing_key');

    expect($key)->toHaveLength(40)
        ->and(WhatsApp::configured($admin->company_id))->toBeTrue()
        ->and($this->getJson('/api/settings/whatsapp')->json('data.bird_signing_key'))->toBe($key);
    $this->putJson('/api/settings/whatsapp', ['whatsapp_bird_channel_id' => 'not-a-uuid'])->assertJsonValidationErrors('whatsapp_bird_channel_id');
});
