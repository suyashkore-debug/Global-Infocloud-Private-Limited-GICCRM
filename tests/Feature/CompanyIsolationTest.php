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
    $lead = Lead::find(test()->postJson('/api/leads', ['email' => uniqid('lead', true).'@lead.test', 
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

it('keeps each company\'s settings, country, tax number, lists, web forms and vendors to itself', function () {
    $a = companyWithSecrets();
    $this->putJson('/api/setup/options', ['options' => ['company_name' => 'ZXQ-SECRET Pvt Ltd', 'company_country' => 'India', 'company_vat' => '27ABCDE1234F1Z5', 'company_address' => 'ZXQ-SECRET Road', 'timezone' => 'Asia/Kolkata']])->assertOk();
    $currency = $this->postJson('/api/setup/currencies', ['name' => 'ZXQ-SECRET', 'symbol' => 'Z', 'decimal_separator' => '.', 'placement' => 'before'])->assertCreated()->json('data.id');
    $tax = $this->postJson('/api/setup/taxes', ['name' => 'ZXQ-SECRET Tax', 'rate' => 5])->assertCreated()->json('data.id');
    $form = $this->postJson('/api/lead-forms', secretWebForm('ZXQ-SECRET Form'))->assertCreated()->json('data.id');
    $vendor = $this->postJson('/api/purchase/vendors', ['name' => 'ZXQ-SECRET Vendor', 'vat' => '27ABCDE1234F1Z5'])->assertCreated()->json('data.id');
    $this->putJson("/api/leads/{$a['lead']->id}", ['email' => $a['lead']->email, 'name' => 'ZXQ-SECRET Lead edited', 'lead_status_id' => $a['lead']->lead_status_id, 'lead_source_id' => $a['lead']->lead_source_id])->assertOk();

    // Company B, in the UAE.
    signIn(companyAdmin(Company::factory()->create()));
    $this->putJson('/api/setup/options', ['options' => ['company_name' => 'Gulf Co', 'company_country' => 'United Arab Emirates', 'company_vat' => '100123456700003', 'timezone' => 'Asia/Dubai']])->assertOk();

    foreach (['setup/options', 'app-options', 'setup/currencies', 'setup/taxes', 'setup/lead-statuses', 'setup/payment-modes', 'lead-forms', 'purchase/vendors', 'leads', 'activity-log', 'dashboard/widgets'] as $url) {
        $response = $this->getJson("/api/{$url}");
        expect($response->status())->toBeLessThan(500, "GET /api/{$url} failed")
            ->and($response->getContent())->not->toContain('ZXQ-SECRET', "GET /api/{$url} shows company A's data")
            ->and($response->getContent())->not->toContain('27ABCDE1234F1Z5', "GET /api/{$url} shows company A's GSTIN");
    }
    expect($this->getJson("/api/purchase/vendors/{$vendor}")->status())->toBeIn([403, 404])
        ->and($this->putJson("/api/setup/currencies/{$currency}", ['name' => 'hacked', 'symbol' => 'H', 'decimal_separator' => '.', 'placement' => 'before'])->status())->toBeIn([403, 404])
        ->and($this->deleteJson("/api/setup/taxes/{$tax}")->status())->toBeIn([403, 404])
        ->and($this->putJson("/api/lead-forms/{$form}", secretWebForm('hacked'))->status())->toBeIn([403, 404])
        ->and($this->patchJson("/api/lead-forms/{$form}/active", ['active' => false])->status())->toBeIn([403, 404])
        ->and($this->postJson("/api/leads/{$a['lead']->id}/activities", ['description' => 'hacked'])->status())->toBeIn([403, 404])
        ->and($this->putJson("/api/staff-members/{$a['staff']->id}", ['first_name' => 'hacked', 'email' => 'h@x.test'])->status())->toBeIn([403, 404]);

    // B's own settings are its own; A's stay as they were.
    $this->getJson('/api/app-options')->assertJsonPath('data.timezone', 'Asia/Dubai')->assertJsonPath('data.tax_id_label', 'TRN');
    expect(App\Services\Options::get('company_vat', $a['company']->id))->toBe('27ABCDE1234F1Z5')
        ->and(App\Services\Options::get('timezone', $a['company']->id))->toBe('Asia/Kolkata')
        ->and(App\Services\Options::get('company_name', $a['company']->id))->toBe('ZXQ-SECRET Pvt Ltd')
        ->and(App\Models\Currency::withoutGlobalScopes()->find($currency)->name)->toBe('ZXQ-SECRET')
        ->and(App\Models\Tax::withoutGlobalScopes()->find($tax))->not->toBeNull()
        ->and(App\Models\Vendor::withoutGlobalScopes()->find($vendor)->name)->toBe('ZXQ-SECRET Vendor')
        ->and(User::find($a['staff']->id)->first_name)->toBe('ZXQ-SECRET');
});

it('rejects another company\'s ids when saving records', function () {
    $a = companyWithSecrets();
    signIn(companyAdmin(Company::factory()->create()));
    DefaultLookups::ensureLeadLists();
    $base = ['lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id')];

    $this->postJson('/api/leads', ['email' => uniqid('lead', true).'@lead.test', ...$base, 'name' => 'Mine', 'assigned_id' => $a['staff']->id])->assertJsonValidationErrors('assigned_id');
    $this->postJson('/api/tasks', ['name' => 'Mine', 'project_id' => $a['project']->id, 'start_date' => today()->toDateString()])->assertJsonValidationErrors('project_id');
    $this->postJson('/api/projects', ['name' => 'Mine', 'customer_id' => $a['customer']->id, 'start_date' => today()->toDateString(), 'billing_type' => 1, 'status' => 1])->assertJsonValidationErrors('customer_id');
    $this->postJson('/api/lead-forms', ['name' => 'F', 'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name']], 'notify_ids' => [$a['staff']->id]])->assertJsonValidationErrors('notify_ids.0');
});

/** @return array<string, mixed> */
function secretWebForm(string $name): array
{
    DefaultLookups::ensureLeadLists();

    return [
        'name' => $name, 'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name', 'required' => true]],
        'lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id'),
        'submit_btn_name' => 'Send', 'submit_btn_bg_color' => '#fa6010', 'submit_btn_text_color' => '#ffffff', 'submit_action' => 'message', 'success_submit_msg' => 'Thanks!',
    ];
}
