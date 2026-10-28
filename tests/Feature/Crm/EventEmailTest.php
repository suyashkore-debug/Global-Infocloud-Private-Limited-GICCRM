<?php

use App\Mail\TemplateMail;
use App\Models\Customer;
use App\Models\EmailTemplate;
use App\Models\Invoice;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Project;
use App\Models\Task;
use App\Services\DefaultLookups;
use App\Services\Emails;
use Illuminate\Support\Facades\Mail;

it('e-mails the staff member a lead is assigned to', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $agent = staffMember($admin->company);
    DefaultLookups::ensureLeadLists();
    $this->postJson('/api/leads', [
        'name' => 'Ravi Patil', 'email' => 'ravi@patil.test', 'assigned_id' => $agent->id,
        'lead_status_id' => LeadStatus::where('name', 'New Lead')->value('id'), 'lead_source_id' => LeadSource::where('name', 'Google')->value('id'),
    ])->assertCreated();

    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => $m->hasTo($agent->email) && str_contains($m->body, 'Ravi Patil'));
});

it('respects GIC\'s disabled task e-mails until they are switched on', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $member = staffMember($admin->company);
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $project->members()->create(['user_id' => $member->id]);
    $task = Task::factory()->for($project)->create();

    $this->postJson("/api/tasks/{$task->id}/assignees", ['user_id' => $member->id])->assertSuccessful();
    Mail::assertNotSent(TemplateMail::class);

    EmailTemplate::where('slug', 'task-assigned')->update(['active' => true]);
    $other = staffMember($admin->company);
    $project->members()->create(['user_id' => $other->id]);
    $this->postJson("/api/tasks/{$task->id}/assignees", ['user_id' => $other->id])->assertSuccessful();
    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => $m->hasTo($other->email) && str_contains($m->mailSubject, $task->name));
});

it('e-mails the customer when staff reply to a ticket', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $contact = $customer->contacts()->create(['first_name' => 'Asha', 'email' => 'asha@c.test', 'is_primary' => true]);
    $department = $this->postJson('/api/setup/support-departments', ['name' => 'Technical'])->json('data.id');
    $priority = $this->getJson('/api/setup/ticket-priorities')->json('data.0.id');
    $ticket = $this->postJson('/api/tickets', ['subject' => 'Login issue', 'message' => 'Cannot log in', 'contact_id' => $contact->id, 'support_department_id' => $department, 'ticket_priority_id' => $priority])->json('data.id');

    $this->postJson("/api/tickets/{$ticket}/reply", ['message' => 'Please reset your password'])->assertOk();
    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => $m->hasTo('asha@c.test') && str_contains($m->body, 'Please reset your password'));
});

it('e-mails payment receipts unless told not to', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $customer->contacts()->create(['first_name' => 'Asha', 'email' => 'asha@c.test', 'is_primary' => true]);
    Emails::ensureTemplates($admin->company_id);
    EmailTemplate::where('slug', 'invoice-payment-recorded')->update(['active' => true]);
    $invoice = Invoice::factory()->create(['customer_id' => $customer->id, 'total' => 1000]);

    $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 100, 'date' => today()->toDateString(), 'do_not_send_email' => true])->assertCreated();
    Mail::assertNotSent(TemplateMail::class, fn (TemplateMail $m) => $m->hasTo('asha@c.test'));
    $this->postJson("/api/invoices/{$invoice->id}/payments", ['amount' => 100, 'date' => today()->toDateString()])->assertCreated();
    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => $m->hasTo('asha@c.test') && count($m->files) === 1);
});
