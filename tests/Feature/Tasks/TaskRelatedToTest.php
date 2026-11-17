<?php

use App\Models\Company;
use App\Models\Customer;
use App\Models\EmailLog;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Task;
use App\Services\DefaultLookups;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function relatedTask(array $overrides = []): array
{
    return ['name' => 'Call about it', 'priority' => 2, 'start_date' => today()->toDateString(), ...$overrides];
}

it('relates a task to an invoice, customer or ticket, lists it there, and keeps one relation', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Acme Ltd']);
    $invoice = Invoice::factory()->for($customer)->create();

    // Records to pick from.
    $this->getJson('/api/tasks/relations?type=customer&search=Acme')->assertOk()->assertJsonPath('data.0', ['id' => $customer->id, 'name' => 'Acme Ltd']);
    expect($this->getJson('/api/tasks/relations?type=invoice')->json('data.0.id'))->toBe($invoice->id);

    $id = $this->postJson('/api/tasks', relatedTask(['rel_type' => 'invoice', 'rel_id' => $invoice->id]))->assertCreated()
        ->assertJsonPath('data.related.type', 'invoice')
        ->assertJsonPath('data.related.name', $invoice->formattedNumber())
        ->assertJsonPath('data.related.url', "/invoices/{$invoice->id}")
        ->json('data.id');
    $this->postJson('/api/tasks', relatedTask(['name' => 'Other task']))->assertCreated();

    // The invoice's Tasks: only its own.
    $list = $this->getJson("/api/tasks?rel_type=invoice&rel_id={$invoice->id}")->assertOk()->json('data');
    expect(collect($list)->pluck('id')->all())->toBe([$id]);

    // Related to a project instead: the invoice link goes.
    $project = Project::factory()->for($customer)->create();
    $this->putJson("/api/tasks/{$id}", relatedTask(['project_id' => $project->id, 'rel_type' => null, 'rel_id' => null]))->assertOk();
    $task = Task::find($id);
    expect($task->project_id)->toBe($project->id)->and($task->rel_type)->toBeNull()->and($task->rel_id)->toBeNull();

    // And to a customer: the project link goes.
    $this->putJson("/api/tasks/{$id}", relatedTask(['project_id' => $project->id, 'rel_type' => 'customer', 'rel_id' => $customer->id]))->assertOk()
        ->assertJsonPath('data.related.name', 'Acme Ltd');
    expect(Task::find($id)->project_id)->toBeNull();
});

it('refuses another company\'s records and records the person may not open', function () {
    $other = Customer::factory()->create(['company_id' => Company::factory()->create()->id, 'name' => 'Not yours']);
    $admin = signIn(companyAdmin());

    $this->postJson('/api/tasks', relatedTask(['rel_type' => 'customer', 'rel_id' => $other->id]))->assertJsonValidationErrors('rel_id');
    $this->postJson('/api/tasks', relatedTask(['rel_type' => 'planet', 'rel_id' => 1]))->assertJsonValidationErrors('rel_type');
    expect($this->getJson('/api/tasks/relations?type=customer')->json('data'))->toBe([]);

    // A staff member without customer permissions cannot relate a task to a customer.
    $mine = Customer::factory()->create(['company_id' => $admin->company_id]);
    signIn(staffMember($admin->company, ['tasks.create']));
    $this->postJson('/api/tasks', relatedTask(['rel_type' => 'customer', 'rel_id' => $mine->id]))->assertJsonValidationErrors('rel_id');
    expect($this->getJson('/api/tasks/relations?type=customer')->json('data'))->toBe([]);
});

it('lets the finish date of a completed task be corrected', function () {
    signIn(companyAdmin());
    $id = $this->postJson('/api/tasks', relatedTask())->assertCreated()->json('data.id');

    // Not finished yet: the date is ignored.
    $this->putJson("/api/tasks/{$id}", relatedTask(['date_finished' => '2026-01-05 10:00:00']))->assertOk();
    expect(Task::find($id)->date_finished)->toBeNull();

    $this->postJson("/api/tasks/{$id}/status", ['status' => 5])->assertOk();
    $this->putJson("/api/tasks/{$id}", relatedTask(['date_finished' => '2026-01-05 10:00:00']))->assertOk();
    expect(Task::find($id)->date_finished->format('Y-m-d H:i'))->toBe('2026-01-05 10:00');
});

it('takes files with a new task', function () {
    Storage::fake();
    signIn(companyAdmin());
    $id = $this->postJson('/api/tasks', relatedTask())->assertCreated()->json('data.id');

    $this->post("/api/tasks/{$id}/attachments", ['files' => [UploadedFile::fake()->create('brief.pdf', 20)]], ['Accept' => 'application/json'])->assertCreated();
    expect(Task::find($id)->attachments()->count())->toBe(1);
});

it('shows the e-mails sent to a lead', function () {
    $admin = signIn(companyAdmin());
    DefaultLookups::ensureLeadLists();
    $lead = Lead::create(['name' => 'Ravi', 'email' => 'ravi@lead.test', 'lead_status_id' => App\Models\LeadStatus::value('id'), 'lead_source_id' => App\Models\LeadSource::value('id'), 'created_by' => $admin->id]);
    EmailLog::create(['template' => 'x', 'to' => 'ravi@lead.test', 'subject' => 'Thanks for your enquiry', 'rel_type' => 'lead', 'rel_id' => $lead->id, 'status' => 'sent', 'user_id' => $admin->id]);
    EmailLog::create(['template' => 'y', 'to' => 'ravi@lead.test', 'subject' => 'Your proposal', 'rel_type' => 'proposal', 'rel_id' => 9, 'status' => 'failed', 'error' => 'Mailbox full']);
    EmailLog::create(['template' => 'z', 'to' => 'someone@else.test', 'subject' => 'Not his', 'status' => 'sent']);

    $emails = $this->getJson("/api/leads/{$lead->id}/emails")->assertOk()->json('data');
    expect(collect($emails)->pluck('subject')->all())->toBe(['Your proposal', 'Thanks for your enquiry'])
        ->and($emails[1]['sent_by'])->toBe($admin->full_name)
        ->and($emails[0]['error'])->toBe('Mailbox full');

    signIn(companyAdmin(Company::factory()->create()));
    $this->getJson("/api/leads/{$lead->id}/emails")->assertNotFound();
});
