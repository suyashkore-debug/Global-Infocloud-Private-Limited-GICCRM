<?php

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Proposal;
use App\Services\DefaultLookups;

function leadPayload(array $overrides = []): array
{
    DefaultLookups::ensureLeadLists();

    return [
        'name' => 'Ravi Patil',
        'company' => 'Patil Traders',
        'email' => 'ravi@patil.test',
        'lead_status_id' => LeadStatus::where('name', 'New Lead')->value('id'),
        'lead_source_id' => LeadSource::where('name', 'Google')->value('id'),
        'lead_value' => 25000,
        ...$overrides,
    ];
}

it('seeds GIC lead statuses and lets any staff member add leads, notifying the assignee', function () {
    $company = Company::factory()->create();
    $sales = staffMember($company);
    $other = staffMember($company);
    signIn($sales);

    $this->getJson('/api/setup/lead-statuses')->assertJsonFragment(['name' => 'Demo Done'])->assertJsonFragment(['name' => 'Customer', 'is_default' => true]);

    $id = $this->postJson('/api/leads', leadPayload(['assigned_id' => $other->id]))->assertCreated()->json('data.id');

    expect(AppNotification::where('user_id', $other->id)->count())->toBe(1);
    $this->getJson("/api/leads/{$id}")->assertJsonPath('data.activities.0.description', 'Created lead');
});

it('limits staff to their own and public leads unless they have view', function () {
    $company = Company::factory()->create();
    $a = staffMember($company);
    $b = staffMember($company);

    signIn($a);
    $mine = $this->postJson('/api/leads', leadPayload())->json('data.id');
    signIn($b);
    $this->postJson('/api/leads', leadPayload(['name' => 'Public', 'email' => 'public@lead.test', 'is_public' => true]));
    $this->postJson('/api/leads', leadPayload(['name' => 'Private B', 'email' => 'private-b@lead.test']));

    signIn($a);
    expect(collect($this->getJson('/api/leads')->json('data'))->pluck('name')->sort()->values()->all())->toBe(['Public', 'Ravi Patil']);
    $this->deleteJson("/api/leads/{$mine}")->assertForbidden();
});

it('moves a lead on the kanban, logging the status change', function () {
    signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload())->json('data.id');
    $demo = LeadStatus::where('name', 'Demo Done')->value('id');

    $this->postJson('/api/leads/move', ['lead_status_id' => $demo, 'order' => [$id]])->assertOk();

    $view = $this->getJson("/api/leads/{$id}")->assertJsonPath('data.status.name', 'Demo Done');
    expect(collect($view->json('data.activities'))->pluck('description'))->toContain('Status changed from New Lead to Demo Done');
});

it('converts a lead into a customer with its primary contact and proposals', function () {
    $admin = signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload(['city' => 'Pune']))->json('data.id');
    $proposal = Proposal::create(['company_id' => $admin->company_id, 'subject' => 'Offer', 'lead_id' => $id, 'proposal_to' => 'Ravi', 'date' => today(), 'hash' => str_repeat('a', 32), 'created_by' => $admin->id]);

    $customerId = $this->postJson("/api/leads/{$id}/convert", ['contact_first_name' => 'Ravi', 'email' => 'ravi@patil.test'])
        ->assertCreated()->assertJsonPath('data.name', 'Patil Traders')->assertJsonPath('data.primary_contact.email', 'ravi@patil.test')->json('data.id');

    expect(Lead::find($id))->customer_id->toBe($customerId)->status->name->toBe('Customer')
        ->and($proposal->refresh()->customer_id)->toBe($customerId)
        ->and(Customer::find($customerId)->billing_city)->toBe('Pune');
    $this->postJson("/api/leads/{$id}/convert", ['contact_first_name' => 'Ravi', 'email' => 'ravi@patil.test'])->assertUnprocessable();
});

it('hides lost leads by default and updates last contact from a contacted note', function () {
    signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload())->json('data.id');

    $this->postJson("/api/records/lead/{$id}/notes", ['description' => 'Called, interested', 'contacted_at' => today()->toDateString().' 10:00'])->assertCreated();
    expect(Lead::find($id)->last_contact_at->toDateString())->toBe(today()->toDateString());

    $this->postJson("/api/leads/{$id}/flag", ['flag' => 'lost', 'value' => true])->assertOk();
    $this->getJson('/api/leads')->assertJsonCount(0, 'data');
    $this->getJson('/api/leads?lost=1')->assertJsonCount(1, 'data');
});

it('opens a ticket for a contact, notifies the department and marks it answered on a staff reply', function () {
    $admin = signIn(companyAdmin());
    $agent = staffMember($admin->company);
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $contact = $customer->contacts()->create(['first_name' => 'Asha', 'email' => 'asha@c.test', 'is_primary' => true]);
    $department = $this->postJson('/api/setup/support-departments', ['name' => 'Technical', 'member_ids' => [$agent->id]])->assertCreated()->json('data.id');
    $priority = $this->getJson('/api/setup/ticket-priorities')->json('data.1.id');

    $ticket = $this->postJson('/api/tickets', ['subject' => 'Login issue', 'message' => 'Cannot log in', 'contact_id' => $contact->id, 'support_department_id' => $department, 'ticket_priority_id' => $priority])
        ->assertCreated()
        ->assertJsonPath('data.status.name', 'Open')
        ->assertJsonPath('data.customer.id', $customer->id)
        ->assertJsonPath('data.requester', 'Asha')
        ->json('data.id');
    expect(AppNotification::where('user_id', $agent->id)->count())->toBe(1);

    $this->postJson("/api/tickets/{$ticket}/reply", ['message' => 'Please reset your password'])
        ->assertOk()->assertJsonPath('data.status.name', 'Answered')->assertJsonCount(1, 'data.replies');

    signIn($agent);
    $this->getJson('/api/tickets')->assertJsonCount(1, 'data');
    signIn(staffMember($admin->company));
    $this->getJson('/api/tickets')->assertJsonCount(0, 'data');
    $this->getJson("/api/tickets/{$ticket}")->assertForbidden();
});

it('hides closed tickets by default and refuses deleting built-in statuses', function () {
    $admin = signIn(companyAdmin());
    $department = $this->postJson('/api/setup/support-departments', ['name' => 'Billing'])->json('data.id');
    $statuses = collect($this->getJson('/api/setup/ticket-statuses')->json('data'));
    $priority = $this->getJson('/api/setup/ticket-priorities')->json('data.0.id');
    $ticket = $this->postJson('/api/tickets', ['subject' => 'Refund', 'message' => 'x', 'name' => 'Walk-in', 'email' => 'w@x.test', 'support_department_id' => $department, 'ticket_priority_id' => $priority])->json('data.id');

    $this->postJson("/api/tickets/{$ticket}/status", ['ticket_status_id' => $statuses->firstWhere('system_key', 'closed')['id']])->assertOk();
    $this->getJson('/api/tickets')->assertJsonCount(0, 'data');
    $this->deleteJson('/api/setup/ticket-statuses/'.$statuses->first()['id'])->assertUnprocessable();
});

it('rates a lead by the qualification criteria it meets', function () {
    signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload())->json('data.id');
    $this->getJson("/api/leads/{$id}")->assertJsonPath('data.rating', 0)->assertJsonPath('data.qualification', []);

    // Saved in star order, whatever order they are sent in.
    $this->postJson("/api/leads/{$id}/qualification", ['criteria' => ['timeline', 'industry', 'business_need']])
        ->assertOk()
        ->assertJsonPath('data.rating', 3)
        ->assertJsonPath('data.qualification', ['industry', 'business_need', 'timeline'])
        ->assertJsonPath('data.activities.0.description', 'Rating changed to 3/5');
    expect($this->getJson('/api/leads?per_page=10')->json('data.0.rating'))->toBe(3);

    $this->postJson("/api/leads/{$id}/qualification", ['criteria' => ['budget']])->assertUnprocessable();
    $this->postJson("/api/leads/{$id}/qualification", ['criteria' => []])->assertOk()->assertJsonPath('data.rating', 0);
});

it('does not let staff rate a lead they cannot edit', function () {
    $company = Company::factory()->create();
    signIn(staffMember($company));
    $id = $this->postJson('/api/leads', leadPayload())->json('data.id');

    signIn(staffMember($company));
    $this->postJson("/api/leads/{$id}/qualification", ['criteria' => ['industry']])->assertForbidden();
});

it('limits and orders each kanban column as Setup → Leads says', function () {
    $admin = signIn(companyAdmin());
    $ids = collect(['A', 'B', 'C'])->map(fn ($n) => $this->postJson('/api/leads', leadPayload(['name' => $n, 'email' => strtolower($n).'@k.test']))->json('data.id'));
    App\Services\Options::set('leads_kanban_limit', '2', $admin->company_id);
    App\Services\Options::set('default_leads_kanban_sort', 'dateadded', $admin->company_id);
    App\Services\Options::set('default_leads_kanban_sort_type', 'desc', $admin->company_id);

    $response = $this->getJson('/api/leads?kanban=1')->assertOk();
    $newLead = LeadStatus::where('name', 'New Lead')->value('id');
    expect(collect($response->json('data'))->pluck('name')->all())->toBe(['C', 'B'])
        ->and(collect($response->json('meta.summary'))->firstWhere('id', $newLead)['count'])->toBe(3);
});

it('can refuse a second lead from the same company', function () {
    $admin = signIn(companyAdmin());
    App\Services\Options::set('lead_unique_validation', 'company', $admin->company_id);
    $this->postJson('/api/leads', leadPayload(['company' => 'Patil Traders']))->assertCreated();
    $this->postJson('/api/leads', leadPayload(['company' => 'Patil Traders', 'email' => 'other@patil.test']))->assertUnprocessable()->assertJsonValidationErrors('company');
});

it('applies bulk actions to the selected leads and mass deletes them', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    $a = $this->postJson('/api/leads', leadPayload(['name' => 'A', 'email' => 'a@b.test']))->json('data.id');
    $b = $this->postJson('/api/leads', leadPayload(['name' => 'B', 'email' => 'b@b.test']))->json('data.id');
    $demo = LeadStatus::where('name', 'Demo Done')->value('id');

    $this->postJson('/api/leads/bulk', ['ids' => [$a, $b], 'lead_status_id' => $demo, 'assigned_id' => $sales->id, 'tags' => ['erp'], 'visibility' => 'public', 'lost' => true])
        ->assertOk()->assertJsonPath('count', 2);
    $lead = App\Models\Lead::find($a);
    expect($lead->lead_status_id)->toBe($demo)
        ->and($lead->assigned_id)->toBe($sales->id)
        ->and($lead->is_public)->toBeTrue()
        ->and($lead->lost)->toBeTrue()
        ->and($lead->tags->pluck('name')->all())->toBe(['erp']);

    $this->postJson('/api/leads/bulk', ['ids' => [$a, $b], 'mass_delete' => true])->assertOk()->assertJsonPath('message', 'Total leads deleted: 2');
    expect(App\Models\Lead::count())->toBe(0);
});

it('filters the list by the picked statuses while the summary still counts every status', function () {
    signIn(companyAdmin());
    $this->postJson('/api/leads', leadPayload(['name' => 'New one', 'email' => 'n@s.test']));
    $demo = LeadStatus::where('name', 'Demo Done')->value('id');
    $this->postJson('/api/leads', leadPayload(['name' => 'Demo one', 'email' => 'd@s.test', 'lead_status_id' => $demo]));

    $response = $this->getJson("/api/leads?status[]={$demo}")->assertOk();
    expect(collect($response->json('data'))->pluck('name')->all())->toBe(['Demo one'])
        ->and(collect($response->json('meta.summary'))->sum('count'))->toBe(2);
});

it('logs a written activity, keeps the contacted date, moves proposals to a new e-mail and zips the files', function () {
    $admin = signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload(['last_contact_at' => '2026-10-01 10:30:00']))->json('data.id');
    expect(App\Models\Lead::find($id)->last_contact_at->toDateString())->toBe('2026-10-01');

    $this->postJson("/api/leads/{$id}/activities", ['description' => 'Called, will visit Monday'])
        ->assertOk()->assertJsonPath('data.activities.0.description', 'Called, will visit Monday')->assertJsonPath('data.activities.0.custom', true);

    $proposal = Proposal::create(['company_id' => $admin->company_id, 'subject' => 'Offer', 'lead_id' => $id, 'proposal_to' => 'Ravi', 'email' => 'ravi@patil.test', 'date' => today(), 'hash' => str_repeat('b', 32), 'created_by' => $admin->id]);
    $this->putJson("/api/leads/{$id}", leadPayload(['email' => 'new@patil.test', 'update_proposal_emails' => true]))->assertOk();
    expect($proposal->refresh()->email)->toBe('new@patil.test');

    Illuminate\Support\Facades\Storage::fake('local');
    $this->post("/api/records/lead/{$id}/files", ['files' => [Illuminate\Http\UploadedFile::fake()->create('a.pdf', 5), Illuminate\Http\UploadedFile::fake()->create('a.pdf', 5)]], ['Accept' => 'application/json'])->assertCreated();
    $zip = $this->get("/api/records/lead/{$id}/files/zip")->assertOk()->assertHeader('Content-Type', 'application/zip');
    $archive = new ZipArchive;
    $archive->open($zip->baseResponse->getFile()->getPathname());
    expect([$archive->getNameIndex(0), $archive->getNameIndex(1)])->toBe(['a.pdf', 'a (2).pdf']);
});

it('keeps the default language and lets the last contact be edited', function () {
    signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload(['default_language' => 'Marathi', 'country' => 'India']))->assertCreated()->assertJsonPath('data.default_language', 'Marathi')->json('data.id');
    $this->putJson("/api/leads/{$id}", leadPayload(['default_language' => 'Hindi', 'last_contact_at' => '2026-10-20T05:30:00.000Z']))
        ->assertOk()->assertJsonPath('data.default_language', 'Hindi');
    expect(App\Models\Lead::find($id)->last_contact_at->toIso8601String())->toStartWith('2026-10-20T05:30:00');
});

it('relates tasks to a lead and lists them on the lead', function () {
    signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload())->json('data.id');
    $taskId = $this->postJson('/api/tasks', ['name' => 'Call back', 'start_date' => today()->toDateString(), 'priority' => 2, 'lead_id' => $id])->assertCreated()->json('data.id');
    $this->postJson('/api/tasks', ['name' => 'Other', 'start_date' => today()->toDateString(), 'priority' => 2])->assertCreated();

    expect(collect($this->getJson("/api/tasks?lead_id={$id}")->json('data'))->pluck('name')->all())->toBe(['Call back']);
    $this->getJson("/api/tasks/{$taskId}")->assertJsonPath('data.lead', ['id' => $id, 'name' => 'Ravi Patil']);
});

it('converts with a portal password or a set-password e-mail, moving notes and copying same-named custom fields', function () {
    $admin = signIn(companyAdmin());
    $id = $this->postJson('/api/leads', leadPayload())->json('data.id');
    $leadField = App\Models\CustomField::create(['company_id' => $admin->company_id, 'field_to' => 'leads', 'name' => 'Industry', 'slug' => 'leads_industry', 'type' => 'input']);
    $customerField = App\Models\CustomField::create(['company_id' => $admin->company_id, 'field_to' => 'customers', 'name' => 'industry', 'slug' => 'customers_industry', 'type' => 'input']);
    App\Models\CustomFieldValue::create(['custom_field_id' => $leadField->id, 'rel_id' => $id, 'value' => 'Packaging']);
    $this->postJson("/api/records/lead/{$id}/notes", ['description' => 'Met at expo'])->assertSuccessful();

    $customerId = $this->postJson("/api/leads/{$id}/convert", [
        'contact_first_name' => 'Ravi', 'email' => 'ravi@patil.test', 'password' => 'secret-pass-1', 'transfer_notes' => true, 'copy_custom_fields' => true,
    ])->assertSuccessful()->json('data.id');

    $customer = Customer::find($customerId);
    expect($customer->contacts()->first()->has_password)->toBeTrue()
        ->and(App\Models\Note::where('notable_type', Customer::class)->where('notable_id', $customerId)->value('description'))->toBe('Met at expo')
        ->and(App\Models\CustomFieldValue::where('custom_field_id', $customerField->id)->where('rel_id', $customerId)->value('value'))->toBe('Packaging');

    $second = $this->postJson('/api/leads', leadPayload(['name' => 'Asha', 'email' => 'asha@lead.test']))->json('data.id');
    $this->postJson("/api/leads/{$second}/convert", ['contact_first_name' => 'Asha', 'email' => 'asha@lead.test', 'send_set_password_email' => true])->assertSuccessful();
    expect(Illuminate\Support\Facades\DB::table('contact_password_resets')->count())->toBe(1);
});

it('filters leads by Perfex filter rules', function () {
    signIn(companyAdmin());
    $this->postJson('/api/leads', leadPayload(['name' => 'Pune big', 'email' => 'a@r.test', 'city' => 'Pune', 'lead_value' => 90000]));
    $this->postJson('/api/leads', leadPayload(['name' => 'Pune small', 'email' => 'b@r.test', 'city' => 'Pune', 'lead_value' => 1000]));
    $mumbai = $this->postJson('/api/leads', leadPayload(['name' => 'Mumbai', 'email' => 'c@r.test', 'city' => 'Mumbai']))->json('data.id');
    $this->postJson("/api/leads/{$mumbai}/flag", ['flag' => 'lost', 'value' => true]);

    $names = fn (array $rules) => collect($this->getJson('/api/leads?'.http_build_query(['rules' => json_encode($rules)]))->json('data'))->pluck('name')->sort()->values()->all();
    expect($names([['field' => 'city', 'op' => 'equals', 'value' => 'Pune'], ['field' => 'lead_value', 'op' => '>', 'value' => 5000]]))->toBe(['Pune big'])
        ->and($names([['field' => 'created_at', 'op' => 'on', 'value' => now('Asia/Kolkata')->toDateString()]]))->toBe(['Pune big', 'Pune small'])
        ->and($names([['field' => 'lost', 'op' => 'is', 'value' => '1']]))->toBe(['Mumbai'])
        ->and($names([['field' => 'city', 'op' => 'not_contains', 'value' => 'pun']]))->toBe([]);
});

it('sorts the kanban as asked, loads more of one column and counts notes and files', function () {
    $admin = signIn(companyAdmin());
    App\Services\Options::set('leads_kanban_limit', '1', $admin->company_id);
    $first = $this->postJson('/api/leads', leadPayload(['name' => 'First', 'email' => 'f@k.test']))->json('data.id');
    $this->postJson('/api/leads', leadPayload(['name' => 'Second', 'email' => 's@k.test']));
    $this->postJson("/api/records/lead/{$first}/notes", ['description' => 'Hello']);
    $status = LeadStatus::where('name', 'New Lead')->value('id');

    $names = fn (string $query) => collect($this->getJson("/api/leads?kanban=1&{$query}")->json('data'))->pluck('name')->all();
    expect($names('kanban_sort=dateadded&kanban_dir=asc'))->toBe(['First'])
        ->and($names('kanban_sort=dateadded&kanban_dir=desc'))->toBe(['Second'])
        ->and($names("kanban_sort=dateadded&kanban_dir=asc&more[{$status}]=1"))->toBe(['First', 'Second'])
        ->and(collect($this->getJson('/api/leads?kanban=1&kanban_sort=dateadded&kanban_dir=asc')->json('data'))->first()['notes_count'])->toBe(1);
    $this->getJson("/api/leads/{$first}")->assertJsonPath('data.tasks_count', 0);
});

it('saves a lead by first and last name and keeps the full name in step', function () {
    signIn(companyAdmin());
    App\Services\DefaultLookups::ensureLeadLists();
    $base = ['email' => 'ravi@patil.test', 'lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id')];

    $id = $this->postJson('/api/leads', [...$base, 'first_name' => 'Ravi', 'last_name' => 'Patil'])->assertCreated()
        ->assertJsonPath('data.name', 'Ravi Patil')->assertJsonPath('data.last_name', 'Patil')->json('data.id');
    $this->putJson("/api/leads/{$id}", [...$base, 'first_name' => 'Ravindra', 'last_name' => 'Patil'])->assertOk()->assertJsonPath('data.name', 'Ravindra Patil');

    // Only a full name (import, web forms, API): split at the first space.
    $this->postJson('/api/leads', [...$base, 'email' => 'anita@rao.test', 'name' => 'Anita Rao Deshmukh'])->assertCreated()
        ->assertJsonPath('data.first_name', 'Anita')->assertJsonPath('data.last_name', 'Rao Deshmukh');
    $this->postJson('/api/leads', $base)->assertJsonValidationErrors('first_name');
});

it('sorts the list on the server and filters by who created a lead and by date ranges', function () {
    $me = signIn(companyAdmin());
    $other = staffMember($me->company);
    App\Services\DefaultLookups::ensureLeadLists();
    $base = ['lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id')];
    $old = $this->postJson('/api/leads', ['email' => uniqid('lead', true).'@lead.test', ...$base, 'name' => 'Zed Old', 'lead_value' => 500])->json('data.id');
    App\Models\Lead::whereKey($old)->update(['created_at' => now()->subDays(20), 'created_by' => $other->id]);
    $this->postJson('/api/leads', ['email' => uniqid('lead', true).'@lead.test', ...$base, 'name' => 'Amy New', 'lead_value' => 100]);

    $names = fn (array $q) => collect($this->getJson('/api/leads?'.http_build_query($q))->json('data'))->pluck('name')->all();
    expect($names([]))->toBe(['Amy New', 'Zed Old'])
        ->and($names(['sort' => 'created_at', 'dir' => 'asc']))->toBe(['Zed Old', 'Amy New'])
        ->and($names(['sort' => 'name', 'dir' => 'asc']))->toBe(['Amy New', 'Zed Old'])
        ->and($names(['sort' => 'lead_value', 'dir' => 'desc']))->toBe(['Zed Old', 'Amy New'])
        ->and($names(['sort' => 'drop table', 'dir' => 'x']))->toBe(['Amy New', 'Zed Old'])
        ->and($names(['rules' => json_encode([['field' => 'created_by', 'op' => 'is', 'value' => [(string) $me->id]]])]))->toBe(['Amy New'])
        ->and($names(['rules' => json_encode([['field' => 'created_at', 'op' => 'last_7_days']])]))->toBe(['Amy New'])
        ->and($names(['rules' => json_encode([['field' => 'created_at', 'op' => 'last_30_days']])]))->toHaveCount(2)
        ->and($names(['rules' => json_encode([['field' => 'assigned_id', 'op' => 'empty']])]))->toHaveCount(2);
});

it('writes every change of a lead to its activity log, once, saying what changed', function () {
    $me = signIn(companyAdmin());
    $sales = staffMember($me->company);
    App\Services\DefaultLookups::ensureLeadLists();
    $new = App\Models\LeadStatus::where('name', 'New Lead')->value('id');
    $demo = App\Models\LeadStatus::where('name', 'Demo Done')->value('id');
    $google = App\Models\LeadSource::where('name', 'Google')->value('id');
    $id = $this->postJson('/api/leads', ['email' => 'ravi.log@patil.test', 'first_name' => 'Ravi', 'phone' => '111', 'city' => 'Pune', 'lead_status_id' => $new, 'lead_source_id' => $google, 'tags' => ['hot']])->json('data.id');
    $lead = App\Models\Lead::find($id);
    $log = fn () => App\Models\LeadActivity::where('lead_id', $id)->orderBy('id')->pluck('description')->all();

    $this->putJson("/api/leads/{$id}", ['email' => 'ravi.log@patil.test', 'first_name' => 'Ravi', 'last_name' => 'Patil', 'phone' => '222', 'city' => 'Pune', 'lead_status_id' => $demo, 'lead_source_id' => $google, 'assigned_id' => $sales->id, 'lead_value' => 5000, 'tags' => ['hot', 'vip']])->assertOk();
    $this->postJson('/api/leads/move', ['lead_status_id' => $new, 'order' => [$id]])->assertOk();
    $this->postJson("/api/leads/{$id}/flag", ['flag' => 'lost', 'value' => true])->assertOk();
    $field = App\Models\CustomField::create(['company_id' => $me->company_id, 'field_to' => 'leads', 'name' => 'Industry', 'slug' => 'leads_industry', 'type' => 'input']);
    $this->putJson("/api/custom-field-values/leads/{$id}", ['custom_fields' => [$field->id => 'Packaging']])->assertOk();
    $reminder = $this->postJson("/api/records/lead/{$id}/reminders", ['remind_at' => now()->addDay()->toIso8601String(), 'description' => 'Call'])->assertCreated()->json('data.id');
    $this->deleteJson("/api/reminders/{$reminder}")->assertOk();
    $this->postJson('/api/tasks', ['name' => 'Send brochure', 'lead_id' => $id, 'priority' => 2, 'start_date' => today()->toDateString()])->assertCreated();

    $lines = $log();
    expect($lines)->toContain('Created lead')
        ->toContain('Name changed from Ravi to Ravi Patil')
        ->toContain('Phone changed from 111 to 222')
        ->toContain('Status changed from New Lead to Demo Done')
        ->toContain("Assigned to {$sales->full_name}")
        ->toContain('Lead Value changed from — to 5,000.00')
        ->toContain('Tags changed: added vip')
        ->toContain('Status changed from Demo Done to New Lead')
        ->toContain('Marked as lost')
        ->toContain('Industry changed from — to Packaging')
        ->toContain('Created task: Send brochure')
        ->not->toContain('Updated lead')
        ->and(collect($lines)->filter(fn ($l) => str_starts_with($l, 'Status changed from New Lead to Demo Done')))->toHaveCount(1)
        ->and(collect($lines)->filter(fn ($l) => str_starts_with($l, 'Added reminder for')))->toHaveCount(1)
        ->and(collect($lines)->filter(fn ($l) => str_starts_with($l, 'Deleted reminder for')))->toHaveCount(1)
        ->and(collect($lines)->filter(fn ($l) => str_contains($l, 'City')))->toBeEmpty();
});

it('counts WhatsApp messages and calls on the lead, and what is new until the tab is opened', function () {
    $me = signIn(companyAdmin());
    App\Services\DefaultLookups::ensureLeadLists();
    $id = $this->postJson('/api/leads', ['email' => uniqid('lead', true).'@lead.test', 'name' => 'Ravi', 'phone' => '9876543210', 'lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id')])->json('data.id');
    $msg = fn (string $dir, ?string $read) => App\Models\WhatsappMessage::create(['company_id' => $me->company_id, 'lead_id' => $id, 'direction' => $dir, 'wa_id' => '919876543210', 'type' => 'text', 'body' => 'hi', 'status' => 'delivered', 'read_at' => $read]);
    $msg('out', null);
    $msg('in', now()->toDateTimeString());
    $msg('in', null);
    $msg('in', null);
    App\Models\LeadCall::create(['company_id' => $me->company_id, 'lead_id' => $id, 'source' => 'exotel', 'direction' => 'in', 'outcome' => 'answered', 'called_at' => now()]);
    $this->postJson("/api/leads/{$id}/calls", ['direction' => 'out', 'outcome' => array_key_first(App\Models\LeadCall::OUTCOMES), 'called_at' => now()->toDateTimeString()])->assertCreated();

    $this->getJson("/api/leads/{$id}")->assertJsonPath('data.whatsapp_count', 4)->assertJsonPath('data.whatsapp_unread_count', 2)
        ->assertJsonPath('data.calls_count', 2)->assertJsonPath('data.calls_new_count', 1);

    $this->getJson("/api/leads/{$id}/whatsapp")->assertOk();
    $this->getJson("/api/leads/{$id}/calls")->assertOk();
    $this->getJson("/api/leads/{$id}")->assertJsonPath('data.whatsapp_unread_count', 0)->assertJsonPath('data.calls_new_count', 0)->assertJsonPath('data.calls_count', 2);
});
