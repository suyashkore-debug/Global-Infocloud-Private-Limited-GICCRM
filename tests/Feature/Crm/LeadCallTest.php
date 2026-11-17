<?php

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Reminder;
use App\Models\User;
use App\Services\DefaultLookups;

/** A lead added by the given staff member (who is left signed in). */
function callLead(User $by, array $overrides = []): Lead
{
    signIn($by);
    DefaultLookups::ensureLeadLists();

    return Lead::create([
        'company_id' => $by->company_id,
        'created_by' => $by->id,
        'name' => 'Ravi Patil',
        'phone' => '+91 98765 43210',
        'lead_status_id' => LeadStatus::where('name', 'New Lead')->value('id'),
        'lead_source_id' => LeadSource::where('name', 'Google')->value('id'),
        ...$overrides,
    ]);
}

it('logs a call, marks the lead contacted, logs activity and sets the next follow-up', function () {
    $admin = companyAdmin();
    $lead = callLead($admin);

    $this->postJson("/api/leads/{$lead->id}/calls", [
        'direction' => 'out',
        'outcome' => 'answered',
        'called_at' => now()->subMinutes(10)->toIso8601String(),
        'duration_minutes' => 7,
        'notes' => 'Interested, wants a demo on Friday.',
        'follow_up_at' => now()->addDays(2)->toIso8601String(),
    ])->assertCreated()->assertJsonPath('data.outcome', 'answered');

    expect($lead->refresh()->last_contact_at)->not->toBeNull()
        ->and($lead->next_follow_up_at)->not->toBeNull()
        ->and($lead->follow_up_note)->toBe('Follow-up call with Ravi Patil')
        ->and($lead->follow_up_by)->toBe($admin->id);

    $this->getJson("/api/leads/{$lead->id}/calls")
        ->assertJsonPath('data.0.notes', 'Interested, wants a demo on Friday.')
        ->assertJsonPath('meta.phone', '+91 98765 43210')
        ->assertJsonPath('meta.can_log', true);
    $this->getJson("/api/leads/{$lead->id}")->assertJsonPath('data.activities.0.description', 'Logged a call: Answered (7 min)');
});

it('does not count an unanswered call as contact', function () {
    $lead = callLead(companyAdmin());

    $this->postJson("/api/leads/{$lead->id}/calls", ['direction' => 'out', 'outcome' => 'no_answer', 'called_at' => now()->toIso8601String()])->assertCreated();

    expect($lead->refresh()->last_contact_at)->toBeNull();
});

it('rejects calls in the future and unknown outcomes', function () {
    $lead = callLead(companyAdmin());

    $this->postJson("/api/leads/{$lead->id}/calls", ['direction' => 'out', 'outcome' => 'answered', 'called_at' => now()->addDay()->toIso8601String()])->assertJsonValidationErrors('called_at');
    $this->postJson("/api/leads/{$lead->id}/calls", ['direction' => 'out', 'outcome' => 'maybe', 'called_at' => now()->toIso8601String()])->assertJsonValidationErrors('outcome');
});

it('lets only the person who logged a call (or an admin) edit it, and hides other companies\' leads', function () {
    $admin = companyAdmin();
    $a = staffMember($admin->company, ['leads.view', 'leads.edit']);
    $b = staffMember($admin->company, ['leads.view', 'leads.edit']);
    $lead = callLead($admin, ['is_public' => true]);

    signIn($a);
    $id = $this->postJson("/api/leads/{$lead->id}/calls", ['direction' => 'in', 'outcome' => 'callback', 'called_at' => now()->toIso8601String()])->assertCreated()->json('data.id');

    signIn($b);
    $this->putJson("/api/leads/{$lead->id}/calls/{$id}", ['direction' => 'in', 'outcome' => 'answered', 'called_at' => now()->toIso8601String()])->assertForbidden();
    signIn($admin);
    $this->putJson("/api/leads/{$lead->id}/calls/{$id}", ['direction' => 'in', 'outcome' => 'answered', 'called_at' => now()->toIso8601String(), 'duration_minutes' => 3])->assertOk()->assertJsonPath('data.outcome', 'answered');

    signIn(companyAdmin(Company::factory()->create()));
    $this->getJson("/api/leads/{$lead->id}/calls")->assertNotFound();
});
