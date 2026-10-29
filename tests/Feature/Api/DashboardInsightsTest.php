<?php

use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Carbon;

it('shows business panels only to people who may see them', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    Project::factory()->for($customer)->create(['name' => 'Soon', 'deadline' => Carbon::today('Asia/Kolkata')->addDays(3), 'status' => 2]);

    $data = $this->getJson('/api/dashboard/insights')->assertOk()->json('data');
    expect($data)->toHaveKeys(['week', 'deadlines', 'finance', 'team_hours', 'leads', 'tickets'])
        ->and($data['week'])->toHaveCount(7)
        ->and($data['finance']['months'])->toHaveCount(12)
        ->and($data['deadlines'][0])->toMatchArray(['name' => 'Soon', 'days_left' => 3]);

    signIn(staffMember($admin->company));
    $plain = $this->getJson('/api/dashboard/insights')->assertOk()->json('data');
    expect($plain)->not->toHaveKey('finance')->not->toHaveKey('team_hours')
        ->and($plain['deadlines'])->toBe([]); // not a member of the project
});

it('counts my open tasks per day for the coming week, overdue ones on today', function () {
    $me = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $me->company_id]))->create();
    $today = Carbon::today('Asia/Kolkata');
    foreach ([-2, 0, 2, 9] as $offset) {
        Task::factory()->for($project)->create(['due_date' => $today->copy()->addDays($offset), 'status' => 1])->assignees()->create(['user_id' => $me->id]);
    }

    $week = collect($this->getJson('/api/dashboard/insights')->json('data.week'))->pluck('count', 'date');
    expect($week[$today->toDateString()])->toBe(2)
        ->and($week[$today->copy()->addDays(2)->toDateString()])->toBe(1)
        ->and($week->sum())->toBe(3);
});

it('lists hot leads (4-5 stars, not converted), the longest without contact first, and new leads per day', function () {
    signIn(companyAdmin());
    App\Services\DefaultLookups::ensureLeadLists();
    $base = ['lead_status_id' => App\Models\LeadStatus::where('name', 'New Lead')->value('id'), 'lead_source_id' => App\Models\LeadSource::where('name', 'Google')->value('id')];
    $make = fn (string $name, ?string $contact) => $this->postJson('/api/leads', [...$base, 'name' => $name, 'email' => strtolower($name).'@lead.test', 'last_contact_at' => $contact])->json('data.id');
    $five = $make('Five', now()->subDay()->toDateTimeString());
    $fourOld = $make('FourOld', now()->subDays(9)->toDateTimeString());
    $three = $make('Three', null);
    $this->postJson("/api/leads/{$five}/qualification", ['criteria' => App\Models\Lead::QUALIFICATION]);
    $this->postJson("/api/leads/{$fourOld}/qualification", ['criteria' => array_slice(App\Models\Lead::QUALIFICATION, 0, 4)]);
    $this->postJson("/api/leads/{$three}/qualification", ['criteria' => array_slice(App\Models\Lead::QUALIFICATION, 0, 3)]);

    $leads = $this->getJson('/api/dashboard/insights')->json('data.leads');
    expect(collect($leads['hot'])->pluck('name')->all())->toBe(['Five', 'FourOld'])
        ->and($leads['hot'][0]['rating'])->toBe(5)
        ->and($leads['daily'])->toHaveCount(14)
        ->and(end($leads['daily']))->toBe(3)
        ->and($leads)->toHaveKey('new_last_month');
});
