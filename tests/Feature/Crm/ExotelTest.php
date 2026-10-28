<?php

use App\Models\AppNotification;
use App\Models\Lead;
use App\Models\LeadCall;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use App\Services\DefaultLookups;
use App\Services\Exotel;
use App\Services\Options;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/** A lead added by the given staff member (who is left signed in). */
function exotelLead(User $by, array $overrides = []): Lead
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

function connectExotel(int $companyId): void
{
    Options::set('calls_provider', 'exotel', $companyId);
    Options::set('calls_exotel_sid', 'gicfolks1', $companyId);
    Options::set('calls_caller_id', '08047112233', $companyId);
    Options::setSecret('calls_exotel_api_key', 'key123', $companyId);
    Options::setSecret('calls_exotel_api_token', 'token456', $companyId);
}

it('places a click-to-call from the staff member\'s mobile and completes it from the status callback', function () {
    Http::fake([
        'api.exotel.com/*' => Http::response(['Call' => ['Sid' => 'CA111', 'Status' => 'in-progress']]),
        'recordings.exotel.com/*' => Http::response('MP3DATA', 200, ['Content-Type' => 'audio/mpeg']),
    ]);
    $admin = companyAdmin();
    connectExotel($admin->company_id);
    $sales = staffMember($admin->company, ['leads.view', 'leads.edit']);
    $sales->forceFill(['mobile' => '9822001100'])->save();
    $lead = exotelLead($admin, ['assigned_id' => $sales->id, 'is_public' => true]);

    signIn($sales);
    $this->getJson("/api/leads/{$lead->id}/calls")->assertJsonPath('meta.provider', 'exotel')->assertJsonPath('meta.my_number', '919822001100');
    $this->postJson("/api/leads/{$lead->id}/calls/dial")->assertCreated()->assertJsonPath('data.outcome', 'calling');

    Http::assertSent(fn (Request $r) => $r->url() === 'https://api.exotel.com/v1/Accounts/gicfolks1/Calls/connect.json'
        && $r->hasHeader('Authorization', 'Basic '.base64_encode('key123:token456'))
        && $r['From'] === '+919822001100'
        && $r['To'] === '+919876543210'
        && $r['CallerId'] === '08047112233'
        && $r['Record'] === 'true'
        && str_contains($r['StatusCallback'], "/api/calls/exotel/{$admin->company_id}/"));

    // Exotel reports the end of the call; nobody is signed in.
    $token = Options::get('calls_webhook_token', $admin->company_id);
    app('auth')->forgetGuards();
    $this->postJson("/api/calls/exotel/{$admin->company_id}/wrong-token/status", ['CallSid' => 'CA111'])->assertForbidden();
    $this->postJson("/api/calls/exotel/{$admin->company_id}/{$token}/status", [
        'CallSid' => 'CA111', 'Status' => 'completed', 'ConversationDuration' => 402, 'RecordingUrl' => 'https://recordings.exotel.com/gicfolks1/CA111.mp3',
    ])->assertOk();

    $call = LeadCall::where('provider_call_id', 'CA111')->first();
    expect($call->outcome)->toBe('answered')
        ->and($call->talk_seconds)->toBe(402)
        ->and($lead->refresh()->last_contact_at)->not->toBeNull();

    signIn($sales);
    $this->getJson("/api/leads/{$lead->id}/calls")->assertJsonPath('data.0.has_recording', true)->assertJsonPath('data.0.source', 'exotel');
    expect($this->get("/api/leads/{$lead->id}/calls/{$call->id}/recording")->assertOk()->getContent())->toBe('MP3DATA');
    $this->getJson("/api/leads/{$lead->id}")->assertJsonPath('data.activities.0.description', 'Outgoing call: Answered (6 min 42 s)');
});

it('treats a completed call with no conversation as not answered by the lead', function () {
    Http::fake(['api.exotel.com/*' => Http::response(['Call' => ['Sid' => 'CA222', 'Status' => 'in-progress']])]);
    $admin = companyAdmin();
    $admin->forceFill(['mobile' => '9822001100'])->save();
    connectExotel($admin->company_id);
    $lead = exotelLead($admin);
    $this->postJson("/api/leads/{$lead->id}/calls/dial")->assertCreated();

    $token = Options::get('calls_webhook_token', $admin->company_id);
    $this->postJson("/api/calls/exotel/{$admin->company_id}/{$token}/status", ['CallSid' => 'CA222', 'Status' => 'completed', 'ConversationDuration' => 0])->assertOk();

    expect(LeadCall::where('provider_call_id', 'CA222')->value('outcome'))->toBe('no_answer')
        ->and($lead->refresh()->last_contact_at)->toBeNull();
});

it('explains why a call cannot be placed', function () {
    Http::fake(['api.exotel.com/*' => Http::response(['RestException' => ['Message' => 'Authentication failed']], 401)]);
    $admin = companyAdmin();
    $admin->forceFill(['mobile' => null])->save();
    $lead = exotelLead($admin);

    $this->postJson("/api/leads/{$lead->id}/calls/dial")->assertStatus(422)->assertJsonFragment(['message' => 'Calling is not set up yet. An admin can connect Exotel in Setup → Calls.']);

    connectExotel($admin->company_id);
    $this->postJson("/api/leads/{$lead->id}/calls/dial")->assertStatus(422)->assertJsonFragment(['message' => 'Your mobile number is not set. Ask an admin to add it in Setup → Calls.']);

    $admin->forceFill(['mobile' => '9822001100'])->save();
    $this->postJson("/api/leads/{$lead->id}/calls/dial")->assertStatus(422)->assertJsonFragment(['message' => 'Exotel did not place the call: Authentication failed']);
    expect(LeadCall::count())->toBe(0);
});

it('logs incoming calls on the matching lead and notifies missed ones', function () {
    $admin = companyAdmin();
    connectExotel($admin->company_id);
    $sales = staffMember($admin->company);
    $lead = exotelLead($admin, ['assigned_id' => $sales->id]);
    Options::set('calls_staff_numbers', json_encode([$sales->id => '98220 01100']), $admin->company_id);
    $token = Exotel::webhookToken($admin->company_id);
    app('auth')->forgetGuards();

    // Answered by the sales person (their number from Setup → Calls).
    $this->get("/api/calls/exotel/{$admin->company_id}/{$token}/incoming?CallSid=IN1&CallFrom=09876543210&DialCallStatus=completed&DialCallDuration=95&DialWhomNumber=09822001100&StartTime=2026-10-28%2014:05:00")->assertOk();
    // Missed, sent twice by the flow: logged and notified once.
    $this->get("/api/calls/exotel/{$admin->company_id}/{$token}/incoming?CallSid=IN2&CallFrom=09876543210&DialCallStatus=no-answer")->assertOk();
    $this->get("/api/calls/exotel/{$admin->company_id}/{$token}/incoming?CallSid=IN2&CallFrom=09876543210&DialCallStatus=no-answer")->assertOk();
    // A number that is no lead's: kept without a lead, admins told.
    $this->get("/api/calls/exotel/{$admin->company_id}/{$token}/incoming?CallSid=IN3&CallFrom=09000011111&DialCallStatus=no-answer")->assertOk();

    $answered = LeadCall::where('provider_call_id', 'IN1')->first();
    expect($answered->lead_id)->toBe($lead->id)
        ->and($answered->user_id)->toBe($sales->id)
        ->and($answered->outcome)->toBe('answered')
        ->and($answered->called_at->utc()->format('H:i'))->toBe('08:35')
        ->and(LeadCall::where('provider_call_id', 'IN2')->value('outcome'))->toBe('missed')
        ->and(AppNotification::where('user_id', $sales->id)->pluck('description')->all())->toBe(['Missed call from lead Ravi Patil'])
        ->and(LeadCall::where('provider_call_id', 'IN3')->first()->lead_id)->toBeNull()
        ->and(AppNotification::where('user_id', $admin->id)->value('description'))->toBe('Missed call from +919000011111');
});

it('lets only admins set up calling and never returns the credentials', function () {
    $admin = companyAdmin();
    $sales = staffMember($admin->company);
    signIn($sales);
    $this->getJson('/api/settings/calls')->assertForbidden();

    signIn($admin);
    $this->putJson('/api/settings/calls', [
        'calls_provider' => 'exotel', 'calls_exotel_sid' => 'gicfolks1', 'calls_caller_id' => '08047112233',
        'calls_exotel_api_key' => 'key123', 'calls_exotel_api_token' => 'token456',
        'staff_numbers' => [$sales->id => '98220 01100', 99999 => '9000000000'],
    ])->assertOk()
        ->assertJsonPath('data.has_api_token', true)
        ->assertJsonMissing(['token456'])
        ->assertJsonFragment(['id' => $sales->id, 'number' => '98220 01100']);

    expect(Exotel::configured($admin->company_id))->toBeTrue()
        ->and(Exotel::staffNumbers($admin->company_id))->toBe([$sales->id => '98220 01100']);
});
