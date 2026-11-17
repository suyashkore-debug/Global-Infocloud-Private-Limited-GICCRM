<?php

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
use Illuminate\Support\Facades\Queue;

function followUpLead(array $overrides = []): Lead
{
    DefaultLookups::ensureLeadLists();

    return Lead::create([
        'name' => 'Meera Joshi',
        'lead_status_id' => LeadStatus::value('id'),
        'lead_source_id' => LeadSource::value('id'),
        'created_by' => auth()->id(),
        ...$overrides,
    ]);
}

it('sets, moves and finishes a lead\'s follow-up, with its Activity Log', function () {
    $admin = signIn(companyAdmin());
    $lead = followUpLead();
    $at = now()->addDay()->setTime(10, 0)->startOfMinute();

    $this->postJson("/api/leads/{$lead->id}/follow-up", ['next_follow_up_at' => $at->toIso8601String(), 'follow_up_note' => 'Send the price list'])->assertOk()
        ->assertJsonPath('data.follow_up_note', 'Send the price list');
    $lead->refresh();
    expect($lead->next_follow_up_at->equalTo($at))->toBeTrue()->and($lead->follow_up_by)->toBe($admin->id)
        ->and($lead->activities()->pluck('description')->implode(' | '))->toContain('Next Follow-up changed from —');

    // Done: counts as contact, logs the outcome, and sets the next one.
    $next = now()->addDays(3)->setTime(11, 0)->startOfMinute();
    $this->postJson("/api/leads/{$lead->id}/follow-up", ['done' => true, 'outcome' => 'Wants a demo', 'next_follow_up_at' => $next->toIso8601String(), 'follow_up_note' => 'Demo'])->assertOk();
    $lead->refresh();
    expect($lead->last_contact_at)->not->toBeNull()->and($lead->next_follow_up_at->equalTo($next))->toBeTrue()->and($lead->follow_up_note)->toBe('Demo')
        ->and($lead->activities()->pluck('description')->all())->toContain('Follow-up done: Wants a demo');

    // Done without a next one clears it.
    $this->postJson("/api/leads/{$lead->id}/follow-up", ['done' => true])->assertOk();
    expect($lead->refresh()->next_follow_up_at)->toBeNull()->and($lead->follow_up_note)->toBeNull();
});

it('counts and filters follow-ups: overdue, today, next 7 days, soonest first', function () {
    signIn(companyAdmin());
    $overdue = followUpLead(['name' => 'Overdue', 'next_follow_up_at' => now()->subHours(3)]);
    $later = followUpLead(['name' => 'In 3 days', 'next_follow_up_at' => now()->addDays(3)]);
    followUpLead(['name' => 'In a month', 'next_follow_up_at' => now()->addMonth()]);
    followUpLead(['name' => 'None']);

    $summary = $this->getJson('/api/leads/follow-ups')->assertOk()->json('data');
    expect($summary['overdue'])->toBe(1)->and($summary['next_7_days'])->toBeGreaterThanOrEqual(1);

    $rules = fn (string $op) => json_encode([['field' => 'next_follow_up_at', 'op' => $op]]);
    expect(collect($this->getJson('/api/leads?rules='.urlencode($rules('overdue')))->json('data'))->pluck('id')->all())->toBe([$overdue->id]);
    $soon = collect($this->getJson('/api/leads?sort=next_follow_up_at&dir=asc&rules='.urlencode($rules('not_empty')))->json('data'))->pluck('name')->all();
    expect($soon)->toBe(['Overdue', 'In 3 days', 'In a month']);
    expect(collect($this->getJson('/api/leads?rules='.urlencode($rules('next_7_days')))->json('data'))->pluck('id')->all())->toContain($later->id);
});

it('reminds the assignee and whoever set it when a follow-up is due, once', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company, ['leads.view']);
    $lead = followUpLead(['assigned_id' => $sales->id]);
    $this->postJson("/api/leads/{$lead->id}/follow-up", ['next_follow_up_at' => now()->addMinutes(30)->toIso8601String(), 'follow_up_note' => 'Call back'])->assertOk();

    $this->artisan('tasks:send-reminders')->assertSuccessful();
    expect(AppNotification::where('link', "/leads?lead={$lead->id}")->count())->toBe(0);

    $this->travel(31)->minutes();
    $this->artisan('tasks:send-reminders')->assertSuccessful();
    $this->artisan('tasks:send-reminders')->assertSuccessful();
    $sent = AppNotification::where('link', "/leads?lead={$lead->id}")->get();
    expect($sent->pluck('user_id')->sort()->values()->all())->toBe(collect([$admin->id, $sales->id])->sort()->values()->all())
        ->and($sent->first()->description)->toBe('Follow-up due: Meera Joshi (Call back)');

    // A new time gets a new reminder.
    $this->postJson("/api/leads/{$lead->id}/follow-up", ['next_follow_up_at' => now()->addMinutes(5)->toIso8601String()])->assertOk();
    expect($lead->refresh()->follow_up_notified_at)->toBeNull();
});

it('drops the follow-up of a lost lead, and keeps it to people who may edit the lead', function () {
    $admin = signIn(companyAdmin());
    $lead = followUpLead(['next_follow_up_at' => now()->addDay()]);
    $this->postJson("/api/leads/{$lead->id}/flag", ['flag' => 'lost', 'value' => true])->assertOk();
    expect($lead->refresh()->next_follow_up_at)->toBeNull();

    // A new lead can get its first follow-up straight away.
    $id = $this->postJson('/api/leads', ['name' => 'New one', 'lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id'), 'next_follow_up_at' => now()->addDay()->toIso8601String(), 'follow_up_note' => 'Intro call'])
        ->assertCreated()->json('data.id');
    expect(Lead::find($id)->follow_up_by)->toBe($admin->id);

    signIn(staffMember($admin->company));
    $this->postJson("/api/leads/{$id}/follow-up", ['next_follow_up_at' => now()->addDay()->toIso8601String()])->assertForbidden();

    signIn(companyAdmin(Company::factory()->create()));
    $this->postJson("/api/leads/{$id}/follow-up", ['next_follow_up_at' => now()->addDay()->toIso8601String()])->assertNotFound();
    expect($this->getJson('/api/leads/follow-ups')->json('data.next_7_days'))->toBe(0);
});
