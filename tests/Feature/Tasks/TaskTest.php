<?php

use App\Enums\TaskStatus;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskChecklistItem;
use App\Models\TaskTimer;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function projectFor(Company $company): Project
{
    return Project::factory()->for(Customer::factory()->state(['company_id' => $company->id]))->create();
}

it('creates a task with Perfex auto status and notifies assignees', function () {
    $admin = signIn(companyAdmin());
    $project = projectFor($admin->company);
    $dev = staffMember($admin->company);

    $today = $this->postJson('/api/tasks', [
        'name' => 'Build login page', 'project_id' => $project->id, 'priority' => 3,
        'start_date' => today()->toDateString(), 'assignees' => [$dev->id], 'tags' => ['frontend'],
    ])->assertCreated()->assertJsonPath('data.status', TaskStatus::InProgress->value)->assertJsonPath('data.assignees.0.id', $dev->id);

    $this->postJson('/api/tasks', [
        'name' => 'Later task', 'priority' => 2, 'start_date' => today()->addWeek()->toDateString(),
    ])->assertCreated()->assertJsonPath('data.status', TaskStatus::NotStarted->value);

    expect(AppNotification::where('user_id', $dev->id)->value('description'))->toContain('assigned you to task Build login page')
        ->and($project->activities()->pluck('description_key'))->toContain('project_activity_new_task_assignee');
});

it('shows staff only the tasks Perfex lets them see', function () {
    $company = Company::factory()->create();
    $staff = staffMember($company);
    $project = projectFor($company);
    $assigned = Task::factory()->for($project)->create();
    $assigned->assignees()->create(['user_id' => $staff->id]);
    $public = Task::factory()->for($project)->create(['is_public' => true]);
    $hidden = Task::factory()->for($project)->create();

    signIn($staff);

    $ids = collect($this->getJson('/api/tasks')->assertOk()->json('data'))->pluck('id');
    expect($ids->sort()->values()->all())->toBe([$assigned->id, $public->id]);
    $this->getJson("/api/tasks/{$hidden->id}")->assertForbidden();

    // Project members see all the project's tasks.
    $project->members()->create(['user_id' => $staff->id]);
    $this->getJson("/api/tasks/{$hidden->id}")->assertOk();
});

it('lets an assignee change status but not edit the task', function () {
    $company = Company::factory()->create();
    $assignee = staffMember($company);
    $task = Task::factory()->for(projectFor($company))->create(['status' => TaskStatus::InProgress]);
    $task->assignees()->create(['user_id' => $assignee->id]);
    $timer = $task->timers()->create(['user_id' => $assignee->id, 'start_time' => now()->subMinutes(30)]);

    signIn($assignee);

    $this->postJson("/api/tasks/{$task->id}/status", ['status' => 5])->assertOk()->assertJsonPath('data.status', 5);
    expect($task->refresh()->date_finished)->not->toBeNull()
        ->and($timer->refresh()->end_time)->not->toBeNull();

    $this->postJson("/api/tasks/{$task->id}/status", ['status' => 4])->assertOk();
    expect($task->refresh()->date_finished)->toBeNull();

    $this->putJson("/api/tasks/{$task->id}", ['name' => 'Renamed', 'priority' => 1, 'start_date' => today()->toDateString()])->assertForbidden();
});

it('starts a timer only for assignees, stopping their other timer and starting the task', function () {
    $company = Company::factory()->create();
    $dev = staffMember($company);
    $project = projectFor($company);
    $first = Task::factory()->for($project)->create();
    $second = Task::factory()->for($project)->create(['status' => TaskStatus::NotStarted]);
    $first->assignees()->create(['user_id' => $dev->id]);
    $second->assignees()->create(['user_id' => $dev->id]);
    $outsider = Task::factory()->for($project)->create(['is_public' => true]);

    signIn($dev);

    $running = $this->postJson("/api/tasks/{$first->id}/timers/start")->assertCreated()->json('data.id');
    $this->postJson("/api/tasks/{$second->id}/timers/start")->assertCreated();
    $this->postJson("/api/tasks/{$outsider->id}/timers/start")->assertForbidden();

    expect(TaskTimer::find($running)->end_time)->not->toBeNull()
        ->and($second->refresh()->status)->toBe(TaskStatus::InProgress);
    $this->getJson('/api/timers/running')->assertJsonCount(1, 'data')->assertJsonPath('data.0.task.id', $second->id);
});

it('logs time manually from a duration', function () {
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(projectFor($admin->company))->create();
    $task->assignees()->create(['user_id' => $admin->id]);

    $this->postJson("/api/tasks/{$task->id}/timesheets", ['duration' => '1:30', 'note' => 'Review'])
        ->assertCreated()
        ->assertJsonPath('data.duration_seconds', 5400);

    $this->postJson("/api/tasks/{$task->id}/timesheets", ['start_time' => '2026-01-01 10:00', 'end_time' => '2026-01-01 09:00'])
        ->assertUnprocessable();
});

it('manages the checklist and notifies only mentioned staff on a mention comment', function () {
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(projectFor($admin->company))->create();
    $assignee = staffMember($admin->company);
    $mentioned = staffMember($admin->company);
    $task->assignees()->create(['user_id' => $assignee->id]);

    $itemId = $this->postJson("/api/tasks/{$task->id}/checklist", ['description' => 'Write tests', 'save_as_template' => true])->assertCreated()->json('data.id');
    $this->putJson("/api/checklist-items/{$itemId}", ['finished' => true])->assertOk();
    expect(TaskChecklistItem::find($itemId)->finished_by)->toBe($admin->id);
    $this->getJson('/api/checklist-templates')->assertJsonPath('data.0.description', 'Write tests');

    $this->postJson("/api/tasks/{$task->id}/comments", ['content' => 'Please check @[Someone]('.$mentioned->id.')'])->assertCreated();
    expect(AppNotification::where('user_id', $mentioned->id)->count())->toBe(1)
        ->and(AppNotification::where('user_id', $assignee->id)->count())->toBe(0);

    $this->postJson("/api/tasks/{$task->id}/comments", ['content' => 'Plain comment'])->assertCreated();
    expect(AppNotification::where('user_id', $assignee->id)->count())->toBe(1);
});

it('moves tasks on the kanban board', function () {
    $admin = signIn(companyAdmin());
    $project = projectFor($admin->company);
    [$a, $b] = Task::factory()->for($project)->count(2)->create(['status' => TaskStatus::NotStarted])->all();

    $this->postJson('/api/tasks/reorder', ['status' => 3, 'order' => [$b->id, $a->id]])->assertOk();

    expect($a->refresh()->status)->toBe(TaskStatus::Testing)->and($a->kanban_order)->toBe(2)->and($b->refresh()->kanban_order)->toBe(1);
});

it('uploads and downloads task attachments', function () {
    Storage::fake('local');
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(projectFor($admin->company))->create();

    $file = $this->postJson("/api/tasks/{$task->id}/attachments", ['files' => [UploadedFile::fake()->create('spec.pdf', 10, 'application/pdf')]])
        ->assertCreated()->json('data.0');

    expect($file['original_name'])->toBe('spec.pdf');
    $this->get($file['download_url'])->assertOk()->assertDownload('spec.pdf');
    $this->deleteJson("/api/files/{$file['id']}")->assertOk();
    expect(Storage::disk('local')->allFiles())->toBe([]);
});

it('creates the next occurrence of a recurring task with its assignees', function () {
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(projectFor($admin->company))->create([
        'start_date' => today()->subDays(7), 'due_date' => today()->subDays(5), 'repeat_every' => 1, 'recurring_type' => 'week', 'cycles' => 2,
    ]);
    $task->assignees()->create(['user_id' => $admin->id]);

    $this->artisan('tasks:create-recurring')->assertSuccessful();

    $copy = Task::where('recurring_from_id', $task->id)->first();
    expect($copy->start_date->toDateString())->toBe(today()->toDateString())
        ->and($copy->due_date->toDateString())->toBe(today()->addDays(2)->toDateString())
        ->and($copy->repeat_every)->toBeNull()
        ->and($copy->assignees()->pluck('user_id')->all())->toBe([$admin->id])
        ->and($task->refresh()->total_cycles)->toBe(1);
});

it('sends due reminders as notifications', function () {
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(projectFor($admin->company))->create();
    $task->reminders()->create(['user_id' => $admin->id, 'created_by' => $admin->id, 'remind_at' => now()->subMinute(), 'description' => 'Follow up']);

    $this->artisan('tasks:send-reminders')->assertSuccessful();

    expect(AppNotification::withoutGlobalScopes()->where('user_id', $admin->id)->value('description'))->toContain('Follow up');
});

it('does not resolve another company\'s checklist item or timer', function () {
    $foreignTask = Task::factory()->for(projectFor(Company::factory()->create()))->create();
    $item = $foreignTask->checklistItems()->create(['description' => 'Secret', 'created_by' => 1]);
    $timer = $foreignTask->timers()->create(['user_id' => 1, 'start_time' => now()]);

    signIn(companyAdmin());

    $this->putJson("/api/checklist-items/{$item->id}", ['finished' => true])->assertNotFound();
    $this->deleteJson("/api/timesheets/{$timer->id}")->assertNotFound();
});

it('starts a header timer without a task and assigns the task when stopping it', function () {
    $company = Company::factory()->create();
    $dev = staffMember($company);
    $other = staffMember($company);
    $project = projectFor($company);
    $mine = Task::factory()->for($project)->create(['status' => TaskStatus::InProgress]);
    $mine->assignees()->create(['user_id' => $dev->id]);
    $notMine = Task::factory()->for($project)->create(['is_public' => true]);

    signIn($dev);
    $timer = $this->postJson('/api/timers/start')->assertCreated()->json('data.id');
    $this->postJson('/api/timers/start')->assertStatus(422);
    $this->getJson('/api/timers/running')->assertJsonPath('data.0.task', null)->assertJsonPath('meta.can_start_blank', false);
    $this->getJson('/api/timers/assignable-tasks')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);

    $this->postJson("/api/timers/{$timer}/stop")->assertJsonValidationErrors('task_id');
    $this->postJson("/api/timers/{$timer}/stop", ['task_id' => $notMine->id])->assertStatus(422);
    $this->postJson("/api/timers/{$timer}/stop", ['task_id' => $mine->id, 'note' => 'Fixed login'])->assertOk()->assertJsonPath('data.note', 'Fixed login');
    expect(TaskTimer::find($timer))->task_id->toBe($mine->id)->end_time->not->toBeNull();

    // Another member cannot touch my blank timer; I can discard my own running one.
    $blank = $this->postJson('/api/timers/start')->json('data.id');
    signIn($other);
    $this->deleteJson("/api/timers/{$blank}")->assertNotFound();
    signIn($dev);
    $this->deleteJson("/api/timers/{$blank}")->assertOk();
    expect(TaskTimer::find($blank))->toBeNull();
});

it('shows the Perfex status summary, GIC\'s old-pending status, my running timer and the monthly overview', function () {
    $admin = signIn(companyAdmin());
    $project = projectFor($admin->company);
    $mine = Task::factory()->for($project)->create(['status' => TaskStatus::InProgress, 'start_date' => '2026-03-05', 'due_date' => '2026-03-10']);
    $mine->assignees()->create(['user_id' => $admin->id]);
    Task::factory()->for($project)->create(['status' => TaskStatus::InProgress, 'start_date' => '2026-03-08']);
    $old = Task::factory()->for($project)->create(['status' => TaskStatus::NotStarted, 'start_date' => '2026-04-01']);

    $this->postJson("/api/tasks/{$old->id}/status", ['status' => 50])->assertOk();
    $timer = $this->postJson("/api/tasks/{$mine->id}/timers/start")->json('data.id');

    $this->getJson('/api/tasks?status[]=4')
        ->assertJsonPath('meta.summary.4', ['total' => 2, 'mine' => 1])
        ->assertJsonPath('meta.summary.50', ['total' => 1, 'mine' => 0])
        ->assertJsonPath("data.{$this->getJson('/api/tasks?status[]=4')->collect('data')->search(fn ($t) => $t['id'] === $mine->id)}.my_running_timer_id", $timer);

    $this->getJson('/api/tasks/overview?year=2026')
        ->assertJsonCount(2, 'data.3')
        ->assertJsonCount(1, 'data.4')
        ->assertJsonPath('data.4.0.status', 50);
    $this->getJson("/api/tasks/overview?year=2026&month=3&member={$admin->id}")->assertJsonCount(1, 'data.3')->assertJsonMissingPath('data.4');
});
