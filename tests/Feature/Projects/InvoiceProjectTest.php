<?php

use App\Enums\BillingType;
use App\Enums\InvoiceStatus;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\Task;

function billableProject($admin, BillingType $type): array
{
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))
        ->create(['billing_type' => $type, 'project_cost' => 50000, 'project_rate_per_hour' => 1000, 'name' => 'ERP rollout']);
    $design = Task::factory()->for($project)->create(['name' => 'Design', 'billable' => true, 'hourly_rate' => 1500]);
    $build = Task::factory()->for($project)->create(['name' => 'Build', 'billable' => true, 'hourly_rate' => 2000]);
    Task::factory()->for($project)->create(['name' => 'Internal', 'billable' => false]);
    $design->timers()->create(['user_id' => $admin->id, 'start_time' => '2026-10-01 04:00:00', 'end_time' => '2026-10-01 06:00:00']);
    $build->timers()->create(['user_id' => $admin->id, 'start_time' => '2026-10-02 04:00:00', 'end_time' => '2026-10-02 05:30:00']);
    $build->timers()->create(['user_id' => $admin->id, 'start_time' => '2026-10-03 04:00:00', 'end_time' => '2026-10-03 05:00:00']);
    $category = ExpenseCategory::create(['company_id' => $admin->company_id, 'name' => 'Travel']);
    $expense = Expense::create(['company_id' => $admin->company_id, 'expense_category_id' => $category->id, 'name' => 'Site visit', 'amount' => 800,
        'date' => '2026-10-04', 'customer_id' => $project->customer_id, 'project_id' => $project->id, 'billable' => true, 'created_by' => $admin->id]);

    return [$project, $design, $build, $expense];
}

it('invoices a task-hours project one line per task, with its expenses, and frees everything when the invoice is deleted', function () {
    $admin = signIn(companyAdmin());
    [$project, $design, $build, $expense] = billableProject($admin, BillingType::TaskHours);

    $this->getJson("/api/projects/{$project->id}/invoice")->assertOk()
        ->assertJsonCount(2, 'data.tasks')->assertJsonPath('data.tasks.0.hours', 2)->assertJsonPath('data.tasks.0.amount', 3000)
        ->assertJsonPath('data.tasks.1.hours', 2.5)->assertJsonCount(2, 'data.tasks.1.timesheets')->assertJsonPath('data.expenses.0.amount', 800);

    $id = $this->postJson("/api/projects/{$project->id}/invoice", ['type' => 'task_per_item', 'task_ids' => [$design->id, $build->id], 'expense_ids' => [$expense->id]])
        ->assertCreated()->json('data.id');
    $invoice = Invoice::with('items')->find($id);
    expect($invoice->status)->toBe(InvoiceStatus::Draft)
        ->and($invoice->project_id)->toBe($project->id)
        ->and($invoice->items->map(fn ($i) => [$i->description, (float) $i->qty, (float) $i->rate])->all())->toBe([['Design', 2.0, 1500.0], ['Build', 2.5, 2000.0], ['Travel - Site visit', 1.0, 800.0]])
        ->and((float) $invoice->total)->toBe(8800.0)
        ->and($design->refresh()->invoice_id)->toBe($id)->and($expense->refresh()->invoice_id)->toBe($id);

    // Billed: gone from the list, no more timers.
    $this->getJson("/api/projects/{$project->id}/invoice")->assertJsonCount(0, 'data.tasks')->assertJsonCount(0, 'data.expenses');
    $design->assignees()->create(['user_id' => $admin->id]);
    $this->postJson("/api/tasks/{$design->id}/timers/start")->assertForbidden();

    $this->deleteJson("/api/invoices/{$id}")->assertOk();
    expect($design->refresh()->invoice_id)->toBeNull()->and($expense->refresh()->invoice_id)->toBeNull();
});

it('bills project hours as one line or one line per timesheet, and a fixed-rate project at its cost', function () {
    $admin = signIn(companyAdmin());
    [$project, $design, $build] = billableProject($admin, BillingType::ProjectHours);

    $single = $this->postJson("/api/projects/{$project->id}/invoice", ['type' => 'single_line', 'task_ids' => [$design->id, $build->id]])->assertCreated()->json('data.id');
    $line = Invoice::find($single)->items()->first();
    expect([$line->description, (float) $line->qty, (float) $line->rate])->toBe(['ERP rollout', 4.5, 1000.0]);

    [$project2, $design2, $build2] = billableProject($admin, BillingType::ProjectHours);
    $each = $this->postJson("/api/projects/{$project2->id}/invoice", ['type' => 'timesheets_individually', 'task_ids' => [$build2->id]])->assertCreated()->json('data.id');
    expect(Invoice::find($each)->items()->pluck('qty')->map(fn ($q) => (float) $q)->all())->toBe([1.5, 1.0]);

    [$fixed, $design3] = billableProject($admin, BillingType::FixedRate);
    $this->getJson("/api/projects/{$fixed->id}/invoice")->assertJsonPath('data.types', ['single_line']);
    $fixedId = $this->postJson("/api/projects/{$fixed->id}/invoice", ['type' => 'task_per_item', 'task_ids' => [$design3->id]])->assertCreated()->json('data.id');
    expect((float) Invoice::find($fixedId)->total)->toBe(50000.0);

    $this->postJson("/api/projects/{$project2->id}/invoice", ['type' => 'task_per_item', 'task_ids' => []])->assertJsonValidationErrors('task_ids');

    signIn(staffMember($admin->company, ['projects.view']));
    $this->getJson("/api/projects/{$project->id}/invoice")->assertForbidden();
});

it('lists a project\'s contracts and proposals and keeps its workspace link', function () {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $other = Project::factory()->for($project->customer)->create();

    $this->putJson("/api/projects/{$project->id}", [...$this->getJson("/api/projects/{$project->id}")->json('data'), 'customer_id' => $project->customer_id,
        'billing_type' => 1, 'project_cost' => 100, 'status' => 2, 'workspace_link' => 'https://chat.google.com/room/AAQA'])->assertOk()
        ->assertJsonPath('data.workspace_link', 'https://chat.google.com/room/AAQA');
    $this->putJson("/api/projects/{$project->id}", ['name' => 'X', 'customer_id' => $project->customer_id, 'billing_type' => 1, 'project_cost' => 1, 'status' => 2,
        'start_date' => '2026-10-01', 'workspace_link' => 'javascript:alert(1)'])->assertJsonValidationErrors('workspace_link');

    foreach ([$project, $other] as $p) {
        $this->postJson('/api/contracts', ['subject' => "AMC {$p->id}", 'customer_id' => $p->customer_id, 'project_id' => $p->id, 'start_date' => '2026-10-01'])->assertCreated();
        $this->postJson('/api/proposals', ['subject' => "Offer {$p->id}", 'customer_id' => $p->customer_id, 'project_id' => $p->id, 'date' => '2026-10-01',
            'items' => [['description' => 'Work', 'qty' => 1, 'rate' => 10]]])->assertCreated()->assertJsonPath('data.project.id', $p->id);
    }
    $this->getJson("/api/contracts?project_id={$project->id}")->assertJsonCount(1, 'data')->assertJsonPath('data.0.subject', "AMC {$project->id}");
    $this->getJson("/api/proposals?project_id={$project->id}")->assertJsonCount(1, 'data')->assertJsonPath('data.0.subject', "Offer {$project->id}");
});
