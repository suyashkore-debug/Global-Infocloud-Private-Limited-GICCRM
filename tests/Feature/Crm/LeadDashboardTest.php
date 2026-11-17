<?php

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;

function dashLead(array $attrs): Lead
{
    DefaultLookups::ensureLeadLists();
    $lead = Lead::create([
        'name' => 'Lead '.uniqid(),
        'lead_status_id' => $attrs['lead_status_id'] ?? LeadStatus::orderBy('status_order')->value('id'),
        'lead_source_id' => $attrs['lead_source_id'] ?? LeadSource::where('name', 'Google')->value('id'),
        'created_by' => auth()->id(),
        ...array_diff_key($attrs, ['created_at' => 1]),
    ]);
    if (isset($attrs['created_at'])) {
        $lead->forceFill(['created_at' => $attrs['created_at']])->saveQuietly();
    }

    return $lead;
}

it('sums up the period, the pipeline, follow-ups and the team', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    DefaultLookups::ensureLeadLists();
    $facebook = LeadSource::firstOrCreate(['name' => 'Facebook']);

    dashLead(['assigned_id' => $sales->id, 'assigned_at' => today(), 'lead_value' => 5000, 'last_contact_at' => now()]);
    dashLead(['assigned_id' => $sales->id, 'assigned_at' => today(), 'lead_source_id' => $facebook->id, 'next_follow_up_at' => now()->subHour()]);
    $won = dashLead(['assigned_id' => $sales->id, 'lead_value' => 9000]);
    $won->forceFill(['customer_id' => App\Models\Customer::factory()->create(['company_id' => $admin->company_id])->id, 'converted_at' => now()])->saveQuietly();
    dashLead(['created_at' => now()->subDays(40)]); // the period before (30d)
    dashLead(['lost' => true, 'lead_value' => 100000]); // lost: not in the open pipeline

    $d = $this->getJson('/api/leads/dashboard?period=30d')->assertOk()->json('data');
    expect($d['kpis'])->toMatchArray(['new' => 4, 'converted' => 1, 'contacted' => 1, 'open' => 3, 'overdue' => 1])
        ->and($d['kpis']['open_value'])->toEqual(5000)
        ->and($d['kpis']['new_prev'])->toBe(1)
        ->and(array_sum($d['trend']['new']))->toBe(4)
        ->and(count($d['trend']['labels']))->toBe(30)
        ->and(collect($d['sources'])->firstWhere('source', 'Facebook'))->toMatchArray(['leads' => 1])
        ->and($d['follow_ups'][0]['assigned'])->toBe($sales->full_name);
    $row = collect($d['team'])->firstWhere('id', $sales->id);
    expect($row)->toMatchArray(['open' => 2, 'assigned' => 2, 'contacted' => 1, 'converted' => 1, 'overdue' => 1]);

    // A year is shown per month.
    expect(count($this->getJson('/api/leads/dashboard?period=this_year')->json('data.trend.labels')))->toBe((int) now()->month);
    $this->getJson('/api/leads/dashboard?period=forever')->assertJsonValidationErrors('period');
});

it('counts only the leads a person may see, and never another company\'s', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    dashLead(['assigned_id' => $sales->id]);
    dashLead([]);
    dashLead([]);

    // Without "view all leads", a staff member counts only their own (and public) leads.
    signIn($sales);
    expect($this->getJson('/api/leads/dashboard?period=7d')->json('data.kpis.new'))->toBe(1);

    signIn(companyAdmin(Company::factory()->create()));
    $d = $this->getJson('/api/leads/dashboard?period=7d')->json('data');
    expect($d['kpis']['new'])->toBe(0)->and($d['team'])->toBe([]);
});
