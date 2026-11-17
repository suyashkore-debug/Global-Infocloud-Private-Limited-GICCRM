<?php

use App\Models\CalendarEvent;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Task;
use App\Models\Ticket;
use App\Models\User;
use App\Services\DefaultLookups;
use Illuminate\Support\Str;

/**
 * Company A's records, every one named with a marker that must never reach company B.
 *
 * @return array<string, mixed>
 */
function companyWithSecrets(): array
{
    $admin = signIn(companyAdmin());
    $company = $admin->company;
    $staff = User::factory()->for($company)->create(['full_name' => 'ZXQ-SECRET Staff', 'first_name' => 'ZXQ-SECRET']);
    $customer = Customer::factory()->create(['company_id' => $company->id, 'name' => 'ZXQ-SECRET Customer']);
    $contact = Contact::create(['customer_id' => $customer->id, 'first_name' => 'ZXQ-SECRET', 'email' => 'zxq@secret.test', 'is_primary' => true, 'active' => true]);
    $project = Project::factory()->for($customer)->create(['name' => 'ZXQ-SECRET Project']);
    $project->members()->create(['user_id' => $admin->id]);
    $task = Task::factory()->for($project)->create(['name' => 'ZXQ-SECRET Task']);
    $invoice = Invoice::factory()->for($customer)->create(['client_note' => 'ZXQ-SECRET note']);
    $contract = Contract::create(['subject' => 'ZXQ-SECRET Contract', 'customer_id' => $customer->id, 'start_date' => today(), 'end_date' => today()->addDays(2), 'hash' => Str::random(32), 'created_by' => $admin->id]);
    DefaultLookups::ensureLeadLists();
    $lead = Lead::find(test()->postJson('/api/leads', [
        'name' => 'ZXQ-SECRET Lead', 'email' => 'lead@secret.test', 'lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id'),
    ])->assertCreated()->json('data.id'));
    DefaultLookups::ensureTicketLists();
    $ticket = Ticket::create([
        'subject' => 'ZXQ-SECRET Ticket', 'message' => 'x', 'name' => 'ZXQ', 'email' => 'zxq@secret.test', 'ticket_priority_id' => App\Models\TicketPriority::value('id'), 'support_department_id' => App\Models\SupportDepartment::create(['name' => 'ZXQ-SECRET Dept'])->id,
        'ticket_status_id' => DefaultLookups::ticketStatus('open')->id, 'ticket_key' => Str::random(20), 'created_by' => $admin->id,
    ]);
    CalendarEvent::create(['title' => 'ZXQ-SECRET Event', 'start' => now()->addDay(), 'public' => true, 'user_id' => $admin->id]);
    test()->postJson('/api/saved-filters', ['identifier' => 'leads', 'name' => 'ZXQ-SECRET View', 'filters' => ['rules' => []], 'is_shared' => true])->assertCreated();

    return compact('admin', 'company', 'staff', 'customer', 'contact', 'project', 'task', 'invoice', 'contract', 'lead', 'ticket');
}

it('never shows one company\'s data in another company\'s lists, search or dashboards', function () {
    $a = companyWithSecrets();
    $b = signIn(companyAdmin(Company::factory()->create()));

    $today = today()->toDateString();
    $endpoints = [
        'customers', 'customers/options', 'leads', 'leads?kanban=1', 'projects', 'projects/pinned', 'tasks', 'tasks/overview', 'invoices', 'estimates', 'proposals',
        'contracts', 'credit-notes', 'tickets', 'expenses', 'payments', 'items', 'staff', 'staff-members', 'saved-filters?identifier=leads',
        'search?q=ZXQ', 'search?q=secret', 'dashboard', 'dashboard/insights', 'dashboard/widgets', 'notifications', 'activity-log', 'newsfeed', 'todos',
        "calendar?start={$today}&end=".today()->addWeek()->toDateString(), 'chat/contacts', 'chat/customer-contacts', 'my-timesheets?range=this_month&view_all=1',
        'reports/leads', 'reports/sales', 'reports/management', 'reports/timesheets', 'goals', 'lead-forms', 'estimate-requests', 'kb', 'surveys', 'tags', 'media',
        'timers/assignable-tasks', 'purchase/vendors', 'purchase/orders',
    ];
    foreach ($endpoints as $url) {
        $response = $this->getJson("/api/{$url}");
        expect($response->status())->toBeLessThan(500, "GET /api/{$url} failed")
            ->and($response->getContent())->not->toContain('ZXQ-SECRET', "GET /api/{$url} shows company A's data");
    }
});

it('refuses to open or change another company\'s records by id', function () {
    $a = companyWithSecrets();
    signIn(companyAdmin(Company::factory()->create()));

    $reads = [
        "customers/{$a['customer']->id}", "leads/{$a['lead']->id}", "projects/{$a['project']->id}", "tasks/{$a['task']->id}", "invoices/{$a['invoice']->id}",
        "invoices/{$a['invoice']->id}/pdf", "contracts/{$a['contract']->id}", "tickets/{$a['ticket']->id}", "profile/{$a['staff']->id}",
        "leads/{$a['lead']->id}/whatsapp", "invoices/{$a['invoice']->id}/email", "projects/{$a['project']->id}/gantt",
    ];
    foreach ($reads as $url) {
        $response = $this->getJson("/api/{$url}");
        expect($response->status())->toBeIn([403, 404], "GET /api/{$url} answered {$response->status()}")
            ->and($response->getContent())->not->toContain('ZXQ-SECRET');
    }

    $this->putJson("/api/leads/{$a['lead']->id}", ['name' => 'hacked', 'lead_status_id' => 1, 'lead_source_id' => 1])->assertStatus(404);
    expect($this->putJson("/api/contacts/{$a['contact']->id}", ['first_name' => 'hacked', 'email' => 'h@x.test'])->status())->toBeIn([403, 404]);
    expect($this->deleteJson("/api/contacts/{$a['contact']->id}")->status())->toBeIn([403, 404]);
    $this->deleteJson("/api/customers/{$a['customer']->id}")->assertStatus(404);
    $this->deleteJson("/api/tasks/{$a['task']->id}")->assertStatus(404);
    $this->deleteJson("/api/invoices/{$a['invoice']->id}")->assertStatus(404);
    $this->postJson("/api/invoices/{$a['invoice']->id}/email", ['recipients' => ['x@y.test']])->assertStatus(404);
    expect(Lead::withoutGlobalScopes()->find($a['lead']->id)->name)->toBe('ZXQ-SECRET Lead')
        ->and(Contact::find($a['contact']->id)->first_name)->toBe('ZXQ-SECRET')
        ->and(Customer::withoutGlobalScopes()->find($a['customer']->id))->not->toBeNull()
        ->and(Task::withoutGlobalScopes()->find($a['task']->id))->not->toBeNull();
});

it('rejects another company\'s ids when saving records', function () {
    $a = companyWithSecrets();
    signIn(companyAdmin(Company::factory()->create()));
    DefaultLookups::ensureLeadLists();
    $base = ['lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id')];

    $this->postJson('/api/leads', [...$base, 'name' => 'Mine', 'assigned_id' => $a['staff']->id])->assertJsonValidationErrors('assigned_id');
    $this->postJson('/api/tasks', ['name' => 'Mine', 'project_id' => $a['project']->id, 'start_date' => today()->toDateString()])->assertJsonValidationErrors('project_id');
    $this->postJson('/api/projects', ['name' => 'Mine', 'customer_id' => $a['customer']->id, 'start_date' => today()->toDateString(), 'billing_type' => 1, 'status' => 1])->assertJsonValidationErrors('customer_id');
    $this->postJson('/api/lead-forms', ['name' => 'F', 'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name']], 'notify_ids' => [$a['staff']->id]])->assertJsonValidationErrors('notify_ids.0');
});
