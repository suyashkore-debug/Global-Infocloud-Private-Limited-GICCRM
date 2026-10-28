<?php

use App\Models\AppNotification;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\CustomerAdmin;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use App\Services\DefaultLookups;
use App\Services\Options;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function portalHeadersFor(string $email, $test): array
{
    return ['Authorization' => 'Bearer '.$test->postJson('/api/portal/login', ['email' => $email, 'password' => 'secret123'])->assertOk()->json('data.token')];
}

it('applies the support settings to staff replies, attachments, notifications and the customers area', function () {
    Storage::fake('local');
    $admin = signIn(companyAdmin());
    $agent = staffMember($admin->company);
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $primary = Contact::create(['customer_id' => $customer->id, 'first_name' => 'Asha', 'email' => 'asha@c.test', 'password' => 'secret123', 'is_primary' => true, 'active' => true]);
    $other = Contact::create(['customer_id' => $customer->id, 'first_name' => 'Ravi', 'email' => 'ravi@c.test', 'password' => 'secret123', 'active' => true]);
    $department = $this->postJson('/api/setup/support-departments', ['name' => 'Technical', 'member_ids' => [$agent->id]])->json('data.id');
    $priority = $this->getJson('/api/setup/ticket-priorities')->json('data.0.id');
    $inProgress = DefaultLookups::ticketStatus('in_progress')->id;

    Options::set('receive_notification_on_new_ticket', '0');
    $ticket = $this->postJson('/api/tickets', ['subject' => 'Login', 'message' => 'x', 'contact_id' => $other->id, 'support_department_id' => $department, 'ticket_priority_id' => $priority])->json('data.id');
    expect(AppNotification::where('user_id', $agent->id)->count())->toBe(0);

    Options::set('default_ticket_reply_status', (string) $inProgress);
    Options::set('automatically_assign_ticket_to_first_staff_responding', '1');
    Options::set('maximum_allowed_ticket_attachments', '1');
    $this->post("/api/tickets/{$ticket}/reply", ['message' => 'Looking', 'files' => [UploadedFile::fake()->create('x.exe', 1)]], ['Accept' => 'application/json'])->assertJsonValidationErrors('files.0');
    $this->post("/api/tickets/{$ticket}/reply", ['message' => 'Looking', 'files' => [UploadedFile::fake()->create('a.pdf', 1), UploadedFile::fake()->create('b.pdf', 1)]], ['Accept' => 'application/json'])->assertJsonValidationErrors('files');
    $this->postJson("/api/tickets/{$ticket}/reply", ['message' => 'First'])->assertOk()->assertJsonPath('data.status.id', $inProgress)->assertJsonPath('data.assigned.id', $admin->id);
    Options::set('ticket_replies_order', 'desc');
    $this->travel(5)->seconds(); // replies seconds apart: "newest first" must still win
    $this->postJson("/api/tickets/{$ticket}/reply", ['message' => 'Second'])->assertJsonPath('data.replies.0.message', 'Second');

    // Customers area: the primary contact sees only their own tickets by default.
    $this->getJson('/api/portal/tickets', portalHeadersFor('asha@c.test', $this))->assertJsonCount(0, 'data');
    Options::set('only_show_contact_tickets', '0', $admin->company_id);
    app('auth')->forgetGuards();
    $asha = portalHeadersFor('asha@c.test', $this);
    $this->getJson('/api/portal/tickets', $asha)->assertJsonCount(1, 'data');
    $this->getJson('/api/portal/me', $asha)->assertJsonPath('data.can_close_tickets', false)->assertJsonPath('data.can_edit_company', true);
    $this->postJson("/api/portal/tickets/{$ticket}/close", [], $asha)->assertForbidden();
    Options::set('allow_customer_to_change_ticket_status', '1', $admin->company_id);
    $this->postJson("/api/portal/tickets/{$ticket}/close", [], $asha)->assertOk();

    $this->getJson('/api/portal/knowledge-base', $asha)->assertOk();
    Options::set('use_knowledge_base', '0', $admin->company_id);
    Options::set('allow_primary_contact_to_view_edit_billing_and_shipping', '0', $admin->company_id);
    $this->getJson('/api/portal/knowledge-base', $asha)->assertNotFound();
    $this->putJson('/api/portal/company', ['city' => 'Pune'], $asha)->assertForbidden();
});

it('applies the lead settings: unique e-mail, lock after converting, customer admin', function () {
    $admin = companyAdmin();
    $sales = staffMember($admin->company, ['customers.view', 'customers.create']);
    signIn($sales);
    DefaultLookups::ensureLeadLists();
    $payload = ['name' => 'Ravi', 'email' => 'ravi@patil.test', 'phone' => '98', 'lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id'), 'assigned_id' => $sales->id];
    $id = $this->postJson('/api/leads', $payload)->assertCreated()->json('data.id');
    $this->postJson('/api/leads', [...$payload, 'phone' => '99'])->assertJsonValidationErrors('email');
    Options::set('lead_unique_validation', 'email,phone');
    $this->postJson('/api/leads', [...$payload, 'email' => 'other@x.test'])->assertJsonValidationErrors('phone');
    $this->putJson("/api/leads/{$id}", $payload)->assertOk();

    $customer = $this->postJson("/api/leads/{$id}/convert", ['contact_first_name' => 'Ravi', 'email' => 'ravi@patil.test'])->assertCreated()->json('data.id');
    expect(CustomerAdmin::where('customer_id', $customer)->pluck('user_id')->all())->toBe([$sales->id]);

    Options::set('lead_lock_after_convert_to_customer', '1');
    $this->putJson("/api/leads/{$id}", [...$payload, 'name' => 'Changed'])->assertForbidden();
    signIn($admin);
    $this->putJson("/api/leads/{$id}", [...$payload, 'name' => 'Changed'])->assertOk();
});

it('applies the calendar and PDF settings and manages tags', function () {
    $admin = signIn(companyAdmin());
    $dev = staffMember($admin->company);
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create(['deadline' => '2026-11-20']);
    $mine = Task::factory()->for($project)->create(['name' => 'Mine', 'due_date' => '2026-11-10', 'is_public' => true]);
    $mine->assignees()->create(['user_id' => $admin->id]);
    Task::factory()->for($project)->create(['name' => 'Theirs', 'due_date' => '2026-11-11', 'is_public' => true])->assignees()->create(['user_id' => $dev->id]);

    $types = fn () => collect($this->getJson('/api/calendar?start=2026-11-01&end=2026-11-30')->json('data'))->pluck('title')->all();
    expect($types())->toContain('Task: Mine')->toContain('Task: Theirs')->toContain("Project deadline: {$project->name}");
    Options::set('calendar_only_assigned_tasks', '1');
    Options::set('show_projects_on_calendar', '0');
    expect($types())->toContain('Task: Mine')->not->toContain('Task: Theirs')->not->toContain("Project deadline: {$project->name}");

    $this->getJson('/api/app-options')->assertJsonPath('data.calendar_first_day', '1')->assertJsonMissingPath('data.smtp_password');

    Options::set('pdf_format', 'LETTER-LANDSCAPE');
    Options::set('swap_pdf_info', '1');
    Options::set('show_status_on_pdf_ei', '0');
    $invoice = $this->postJson('/api/invoices', ['customer_id' => $project->customer_id, 'date' => '2026-11-01', 'items' => [['description' => 'Work', 'qty' => 1, 'rate' => 100]]])->json('data.id');
    $this->get("/api/invoices/{$invoice}/pdf")->assertOk()->assertHeader('content-type', 'application/pdf');

    $mine->tags()->create(['name' => 'urgent']);
    $tag = Tag::where('name', 'urgent')->first();
    Tag::create(['name' => 'later']);
    $this->getJson('/api/tags')->assertJsonPath('data.1.name', 'urgent')->assertJsonPath('data.1.used', 1);
    $this->putJson("/api/tags/{$tag->id}", ['name' => 'later'])->assertJsonValidationErrors('name');
    $this->putJson("/api/tags/{$tag->id}", ['name' => 'critical'])->assertOk();
    expect($mine->refresh()->tags->pluck('name')->all())->toBe(['critical']);
    $this->deleteJson("/api/tags/{$tag->id}")->assertOk();
    expect($mine->refresh()->tags)->toHaveCount(0);
    signIn($dev);
    $this->getJson('/api/tags')->assertForbidden();
});
