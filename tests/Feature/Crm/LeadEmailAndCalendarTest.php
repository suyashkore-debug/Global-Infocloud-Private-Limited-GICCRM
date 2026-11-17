<?php

use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Task;
use App\Services\DefaultLookups;
use App\Services\Options;

function leadBase(): array
{
    DefaultLookups::ensureLeadLists();

    return ['lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id')];
}

it('needs an e-mail for a new lead, and a different one for every lead', function () {
    signIn(companyAdmin());
    $this->postJson('/api/leads', [...leadBase(), 'first_name' => 'Ravi'])->assertJsonValidationErrors('email');
    $id = $this->postJson('/api/leads', [...leadBase(), 'first_name' => 'Ravi', 'email' => 'ravi@patil.test'])->assertCreated()->json('data.id');

    // The same address in other letters is the same address.
    $this->postJson('/api/leads', [...leadBase(), 'first_name' => 'Twin', 'email' => 'Ravi@Patil.TEST'])
        ->assertJsonValidationErrors(['email' => "Lead #{$id} Ravi already has this e-mail address."]);
    // The lead itself keeps its address when saved again; it cannot drop it.
    $this->putJson("/api/leads/{$id}", [...leadBase(), 'first_name' => 'Ravi', 'email' => 'ravi@patil.test', 'city' => 'Pune'])->assertOk();
    $this->putJson("/api/leads/{$id}", [...leadBase(), 'first_name' => 'Ravi', 'email' => ''])->assertJsonValidationErrors('email');
});

it('lets older leads without an e-mail (imports, web forms) be edited', function () {
    $admin = signIn(companyAdmin());
    $old = Lead::create([...leadBase(), 'name' => 'Phone only', 'phone' => '9000000001', 'created_by' => $admin->id]);

    $this->putJson("/api/leads/{$old->id}", [...leadBase(), 'first_name' => 'Phone', 'last_name' => 'Only', 'city' => 'Nashik'])->assertOk();
    expect($old->refresh()->city)->toBe('Nashik');
});

it('shows lead follow-ups and tasks on the calendar on their days', function () {
    $admin = signIn(companyAdmin());
    $lead = Lead::create([...leadBase(), 'name' => 'Meera', 'email' => 'm@x.test', 'created_by' => $admin->id, 'next_follow_up_at' => now()->addDays(2)->setTime(5, 0), 'follow_up_note' => 'Send quote']);
    $task = $this->postJson('/api/tasks', ['name' => 'Call back', 'priority' => 2, 'start_date' => today()->addDay()->toDateString()])->json('data.id');

    $items = collect($this->getJson('/api/calendar?start='.today()->toDateString().'&end='.today()->addDays(7)->toDateString())->json('data'));
    $follow = $items->firstWhere('id', "follow-up-{$lead->id}");
    expect($follow)->toMatchArray(['type' => 'follow_up', 'title' => 'Follow-up: Meera (Send quote)', 'link' => "/leads?lead={$lead->id}"])
        ->and(substr($follow['start'], 0, 10))->toBe(now()->addDays(2)->setTime(5, 0)->setTimezone(App\Support\CompanyTime::zone())->toDateString())
        // A task without a due date shows on its start date.
        ->and($items->firstWhere('id', "task-{$task}")['start'])->toBe(today()->addDay()->toDateString());

    Options::set('show_lead_follow_ups_on_calendar', '0');
    expect(collect($this->getJson('/api/calendar?start='.today()->toDateString().'&end='.today()->addDays(7)->toDateString())->json('data'))->where('type', 'follow_up'))->toHaveCount(0);
});
