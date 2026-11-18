<?php

use App\Jobs\SendLeadStatusUpdate;
use App\Jobs\SendTemplateEmail;
use App\Models\AppNotification;
use App\Models\EmailTemplate;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use App\Models\WhatsappMessage;
use App\Services\DefaultLookups;
use App\Services\Emails;
use App\Services\LeadStatusMessages;
use App\Services\Options;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/** A lead of the admin's company, assigned to a colleague, with WhatsApp (Meta) set up. */
function statusLead(User $admin, User $owner): Lead
{
    DefaultLookups::ensureLeadLists();
    Options::set('whatsapp_phone_number_id', '1065403', $admin->company_id);
    Options::setSecret('whatsapp_access_token', 'EAAG-token', $admin->company_id);

    return Lead::create([
        'name' => 'Ravi Patil', 'first_name' => 'Ravi', 'last_name' => 'Patil', 'email' => 'ravi@patil.test', 'phone' => '98765 43210',
        'lead_status_id' => LeadStatus::where('name', 'New Lead')->value('id'), 'lead_source_id' => LeadSource::value('id'),
        'assigned_id' => $owner->id, 'created_by' => $admin->id,
    ]);
}

function moveLeadTo(Lead $lead, string $status)
{
    return test()->putJson("/api/leads/{$lead->id}", [
        'first_name' => 'Ravi', 'last_name' => 'Patil', 'email' => 'ravi@patil.test', 'phone' => '98765 43210',
        'lead_status_id' => LeadStatus::where('name', $status)->value('id'), 'lead_source_id' => $lead->lead_source_id, 'assigned_id' => $lead->assigned_id,
    ])->assertOk();
}

/** The queue worker, 2 minutes later: run the status updates waiting in the (fake) queue. */
function runStatusUpdates(): void
{
    Queue::pushed(SendLeadStatusUpdate::class)->each(fn (SendLeadStatusUpdate $job) => $job->handle(app(LeadStatusMessages::class)));
}

beforeEach(function () {
    Http::fake(['graph.facebook.com/*' => fn () => Http::response(['messages' => [['id' => 'wamid.'.uniqid()]]])]);
});

it('tells the staff at once, and e-mails and WhatsApps the lead 2 minutes later', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $owner = User::factory()->for($admin->company)->create();
    $lead = statusLead($admin, $owner);

    moveLeadTo($lead, 'Proposal Sent');

    expect(AppNotification::where('user_id', $owner->id)->value('description'))->toBe('changed the status of lead Ravi Patil to Proposal Sent')
        // Never to the person who changed it.
        ->and(AppNotification::where('user_id', $admin->id)->exists())->toBeFalse();
    Queue::assertPushed(SendLeadStatusUpdate::class, fn ($job) => $job->leadId === $lead->id && $job->delay !== null);
    Queue::assertNotPushed(SendTemplateEmail::class);

    runStatusUpdates();
    Queue::assertPushed(SendTemplateEmail::class, fn ($job) => $job->to === ['ravi@patil.test'] && str_contains($job->html, 'Proposal Sent'));
    Http::assertSent(fn (Request $r) => $r['type'] === 'text' && str_contains($r['text']['body'], 'Hello Ravi Patil') && str_contains($r['text']['body'], '*Proposal Sent*'));
    expect($lead->activities()->pluck('description'))->toContain('Sent the status update e-mail (Proposal Sent)', 'Sent the status update on WhatsApp (Proposal Sent)')
        // An automatic message is not contact with the lead.
        ->and($lead->refresh()->last_contact_at)->toBeNull()
        ->and(WhatsappMessage::where('lead_id', $lead->id)->value('status'))->toBe('sent');
});

it('sends nothing when a wrong drop is moved back, and only the last of quick changes', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $lead = statusLead($admin, $admin);

    moveLeadTo($lead, 'Demo Done');
    moveLeadTo($lead, 'New Lead');
    runStatusUpdates();
    Queue::assertNotPushed(SendTemplateEmail::class);
    Http::assertNothingSent();

    Queue::fake();
    moveLeadTo($lead, 'Profile Sent');
    moveLeadTo($lead, 'Proposal Sent');
    runStatusUpdates();
    Queue::assertPushed(SendTemplateEmail::class, 1);
    Queue::assertPushed(SendTemplateEmail::class, fn ($job) => str_contains($job->html, 'Proposal Sent'));
    Http::assertSentCount(1);
});

it('sends nothing to the lead for statuses not ticked, or when switched off', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $owner = User::factory()->for($admin->company)->create();
    $lead = statusLead($admin, $owner);

    // Dead Lead is not ticked by default; the staff still hear about it.
    moveLeadTo($lead, 'Dead Lead');
    Queue::assertNotPushed(SendLeadStatusUpdate::class);
    expect(AppNotification::where('user_id', $owner->id)->count())->toBe(1);

    Options::set('lead_status_email_lead', '0');
    Options::set('lead_status_whatsapp_lead', '0');
    Options::set('lead_status_notify_staff', '0');
    moveLeadTo($lead, 'Demo Done');
    runStatusUpdates();
    Queue::assertNotPushed(SendTemplateEmail::class);
    Http::assertNothingSent();
    expect(AppNotification::where('user_id', $owner->id)->count())->toBe(1);
});

it('also sends when a lead is dropped in another kanban column', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $lead = statusLead($admin, $admin);

    $this->postJson('/api/leads/move', ['lead_status_id' => LeadStatus::where('name', 'Demo Done')->value('id'), 'order' => [$lead->id]])->assertOk();
    runStatusUpdates();
    Queue::assertPushed(SendTemplateEmail::class, 1);
    Http::assertSentCount(1);
});

it('sends the approved status template outside the 24-hour window', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $lead = statusLead($admin, $admin);
    Options::set('whatsapp_status_template_name', 'lead_status_update');

    moveLeadTo($lead, 'Demo Done');
    runStatusUpdates();
    Http::assertSent(fn (Request $r) => $r['type'] === 'template' && $r['template']['name'] === 'lead_status_update'
        && $r['template']['components'][0]['parameters'][0]['text'] === 'Ravi Patil'
        && $r['template']['components'][0]['parameters'][1]['text'] === 'Demo Done');
});

it('edits both drafts, the statuses and the on / off in one place (Setup → Leads)', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $lead = statusLead($admin, $admin);
    $demo = LeadStatus::where('name', 'Demo Done')->value('id');

    $page = $this->getJson('/api/settings/lead-status-messages')->assertOk()
        ->assertJsonPath('data.lead_status_email_lead', true)
        ->assertJsonPath('data.email_subject', 'Update on your enquiry with {companyname}');
    expect($page->json('data.whatsapp_message'))->toContain('{lead_status}');

    $save = fn (bool $email) => $this->putJson('/api/settings/lead-status-messages', [
        'lead_status_notify_staff' => true, 'lead_status_email_lead' => $email, 'lead_status_whatsapp_lead' => false,
        'email_subject' => 'Hi {lead_name}: {lead_status}', 'email_message' => '<p>Now {lead_status}</p>',
        'whatsapp_message' => 'Namaskar {lead_name}', 'notify_status_ids' => [$demo],
    ])->assertOk();
    $save(true)->assertJsonPath('data.lead_status_whatsapp_lead', false);

    expect(LeadStatus::where('notify_lead', true)->pluck('id')->all())->toBe([$demo])
        ->and(Options::get('lead_status_whatsapp_message'))->toBe('Namaskar {lead_name}');

    moveLeadTo($lead, 'Proposal Sent');
    Queue::assertNotPushed(SendLeadStatusUpdate::class);
    moveLeadTo($lead, 'Demo Done');
    runStatusUpdates();
    Queue::assertPushed(SendTemplateEmail::class, fn ($job) => $job->subject === 'Hi Ravi Patil: Demo Done' && str_contains($job->html, 'Now Demo Done'));
    Http::assertNothingSent();

    // One switch: off here switches the template off, and a template switched off in Setup → Email Templates shows off here.
    $save(false);
    expect(EmailTemplate::where('slug', 'lead-status-changed')->value('active'))->toBeFalse();
    $save(true);
    EmailTemplate::where('slug', 'lead-status-changed')->update(['active' => false]);
    $this->getJson('/api/settings/lead-status-messages')->assertJsonPath('data.lead_status_email_lead', false);

    // Staff who are not admins cannot change them.
    signIn(User::factory()->for($admin->company)->create());
    $this->getJson('/api/settings/lead-status-messages')->assertForbidden();
});

it('keeps the lines of a typed e-mail signature, and an HTML one as it is', function () {
    expect(Emails::merge('<p>Regards,<br />{email_signature}</p>', ['email_signature' => "Team GIC\nPhone 98xxxx"], true))
        ->toBe("<p>Regards,<br />Team GIC<br />\nPhone 98xxxx</p>")
        ->and(Emails::merge('{email_signature}', ['email_signature' => '<b>GIC</b>'], true))->toBe('<b>GIC</b>');
});
