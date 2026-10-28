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

    $this->getJson("/api/leads/{$id}")->assertJsonPath('data.status.name', 'Demo Done')
        ->assertJsonPath('data.activities.0.description', 'Status changed from New Lead to Demo Done');
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
