<?php

use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimer;

function projectPayload(Customer $customer, array $overrides = []): array
{
    return [
        'name' => 'Website redesign',
        'customer_id' => $customer->id,
        'status' => ProjectStatus::InProgress->value,
        'billing_type' => 1,
        'project_cost' => 75000,
        'project_rate_per_hour' => 900,
        'start_date' => today()->toDateString(),
        'deadline' => today()->addMonth()->toDateString(),
        'progress_from_tasks' => true,
        'members' => [],
        'tags' => ['web', 'design'],
        ...$overrides,
    ];
}

it('lets an admin create a project with members and tags, logging and notifying like Perfex', function () {
    $admin = signIn(companyAdmin());
    $member = staffMember($admin->company);
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);

    $response = $this->postJson('/api/projects', projectPayload($customer, ['members' => [$member->id]]))
        ->assertCreated()
        ->assertJsonPath('data.name', 'Website redesign')
        ->assertJsonPath('data.members.0.id', $member->id)
        ->assertJsonPath('data.tags', ['web', 'design'])
        // Fixed rate keeps only the project cost.
        ->assertJsonPath('data.project_rate_per_hour', null);

    $project = Project::find($response->json('data.id'));
    expect($project->company_id)->toBe($admin->company_id)
        ->and($project->activities()->pluck('description_key')->all())->toContain('project_activity_created', 'project_activity_added_team_member')
        ->and(AppNotification::where('user_id', $member->id)->count())->toBe(1);
});

it('needs the projects create permission for staff', function () {
    $company = Company::factory()->create();
    $customer = Customer::factory()->create(['company_id' => $company->id]);

    signIn(staffMember($company));
    $this->postJson('/api/projects', projectPayload($customer))->assertForbidden();

    signIn(staffMember($company, ['projects.create']));
    $this->postJson('/api/projects', projectPayload($customer))->assertCreated();
});

it('shows staff only the projects they are members of', function () {
    $company = Company::factory()->create();
    $staff = staffMember($company);
    $mine = Project::factory()->for(Customer::factory()->state(['company_id' => $company->id]))->create();
    $mine->members()->create(['user_id' => $staff->id]);
    $other = Project::factory()->for(Customer::factory()->state(['company_id' => $company->id]))->create();

    signIn($staff);

    $this->getJson('/api/projects')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);
    $this->getJson("/api/projects/{$mine->id}")->assertOk();
    $this->getJson("/api/projects/{$other->id}")->assertForbidden();
});

it('never shows another company\'s project', function () {
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => Company::factory()->create()->id]))->create();

    signIn(companyAdmin());

    $this->getJson("/api/projects/{$project->id}")->assertNotFound();
    $this->getJson('/api/projects')->assertOk()->assertJsonCount(0, 'data');
});

it('rejects a customer or member from another company', function () {
    $admin = signIn(companyAdmin());
    $foreignCustomer = Customer::factory()->create(['company_id' => Company::factory()->create()->id]);
    $foreignUser = companyAdmin();

    $this->postJson('/api/projects', projectPayload($foreignCustomer, ['members' => [$foreignUser->id]]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['customer_id', 'members.0']);
});

it('hides finished and cancelled projects by default and counts every status', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    Project::factory()->for($customer)->create(['status' => ProjectStatus::InProgress]);
    Project::factory()->for($customer)->create(['status' => ProjectStatus::Finished]);

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('meta.status_counts.2', 1)
        ->assertJsonPath('meta.status_counts.4', 1);

    $this->getJson('/api/projects?status[]=4')->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 4);
});

it('marks a project finished, completing all tasks and stopping timers', function () {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $task = Task::factory()->for($project)->create(['status' => TaskStatus::InProgress]);
    $timer = $task->timers()->create(['user_id' => $admin->id, 'start_time' => now()->subHour()]);

    $this->postJson("/api/projects/{$project->id}/status", ['status' => 4, 'mark_all_tasks_complete' => true])
        ->assertOk()
        ->assertJsonPath('data.status', 4)
        ->assertJsonPath('data.calculated_progress', 100);

    expect($task->refresh()->status)->toBe(TaskStatus::Complete)
        ->and($task->date_finished)->not->toBeNull()
        ->and($timer->refresh()->end_time)->not->toBeNull()
        ->and($project->refresh()->date_finished)->not->toBeNull();
});

it('calculates progress from finished tasks', function () {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    Task::factory()->for($project)->count(3)->create();
    Task::factory()->for($project)->create(['status' => TaskStatus::Complete]);

    $this->getJson("/api/projects/{$project->id}")->assertJsonPath('data.calculated_progress', 25);
});

it('copies a project with tasks and milestones moved to the new start date', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $project = Project::factory()->for($customer)->create(['start_date' => '2026-01-01', 'deadline' => '2026-02-01']);
    $milestone = $project->milestones()->create(['name' => 'Design', 'start_date' => '2026-01-05', 'due_date' => '2026-01-10']);
    $task = Task::factory()->for($project)->create(['start_date' => '2026-01-15', 'due_date' => '2026-01-20', 'milestone_id' => $milestone->id]);
    $task->assignees()->create(['user_id' => $admin->id]);

    $response = $this->postJson("/api/projects/{$project->id}/copy", [
        'customer_id' => $customer->id,
        'start_date' => '2026-06-01',
        'copy_tasks' => true,
        'copy_task_assignees' => true,
        'copy_milestones' => true,
        'task_status' => 1,
    ])->assertCreated();

    $copy = Project::find($response->json('data.id'));
    $copiedTask = $copy->tasks()->first();
    $copiedMilestone = $copy->milestones()->first();

    expect($copiedTask->start_date->toDateString())->toBe('2026-06-15')
        ->and($copiedTask->due_date->toDateString())->toBe('2026-06-20')
        ->and($copiedTask->milestone_id)->toBe($copiedMilestone->id)
        ->and($copiedTask->assignees()->pluck('user_id')->all())->toBe([$admin->id])
        ->and($copiedMilestone->start_date->toDateString())->toBe('2026-06-05')
        ->and($copiedMilestone->due_date->toDateString())->toBe('2026-06-10');
});

it('keeps pins and notes per user', function () {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();

    $this->postJson("/api/projects/{$project->id}/pin")->assertJsonPath('is_pinned', true);
    $this->getJson('/api/projects/pinned')->assertJsonPath('data.0.id', $project->id);
    $this->postJson("/api/projects/{$project->id}/pin")->assertJsonPath('is_pinned', false);

    $this->putJson("/api/projects/{$project->id}/note", ['content' => 'Call the client on Monday'])->assertOk();
    $this->getJson("/api/projects/{$project->id}/note")->assertJsonPath('data.content', 'Call the client on Monday');

    $colleague = signIn(companyAdmin($admin->company));
    $this->getJson("/api/projects/{$project->id}/note")->assertJsonPath('data.content', null);
});

it('reports overview totals for project-hours billing', function () {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))
        ->create(['billing_type' => 2, 'project_cost' => null, 'project_rate_per_hour' => 1000]);
    $task = Task::factory()->for($project)->create();
    TaskTimer::create(['task_id' => $task->id, 'user_id' => $admin->id, 'start_time' => now()->subHours(2), 'end_time' => now()]);

    $this->getJson("/api/projects/{$project->id}/overview")
        ->assertOk()
        ->assertJsonPath('data.total_logged_seconds', 7200)
        ->assertJsonPath('data.total_amount', 2000);
});
