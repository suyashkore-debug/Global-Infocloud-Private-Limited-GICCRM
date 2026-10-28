<?php

use App\Enums\TaskStatus;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function projectOf(Company $company): Project
{
    return Project::factory()->for(Customer::factory()->state(['company_id' => $company->id]))->create();
}

it('lets project editors manage milestones and members read them', function () {
    $admin = signIn(companyAdmin());
    $project = projectOf($admin->company);
    $member = staffMember($admin->company);
    $project->members()->create(['user_id' => $member->id]);

    $id = $this->postJson("/api/projects/{$project->id}/milestones", ['name' => 'Phase 1', 'due_date' => today()->addWeek()->toDateString(), 'color' => '#22c55e'])
        ->assertCreated()->json('data.id');
    Task::factory()->for($project)->create(['milestone_id' => $id]);

    signIn($member);
    $this->getJson("/api/projects/{$project->id}/milestones")->assertOk()->assertJsonPath('data.0.tasks_total', 1);
    $this->putJson("/api/milestones/{$id}", ['name' => 'Changed', 'due_date' => today()->toDateString()])->assertForbidden();
});

it('lets members open discussions and reply with attachments', function () {
    Storage::fake('local');
    $company = Company::factory()->create();
    $member = staffMember($company);
    $project = projectOf($company);
    $project->members()->create(['user_id' => $member->id]);

    signIn($member);

    $discussion = $this->postJson("/api/projects/{$project->id}/discussions", ['subject' => 'Kickoff', 'description' => 'Agenda'])
        ->assertCreated()->json('data.id');
    $parent = $this->postJson("/api/discussions/{$discussion}/comments", ['content' => 'First'])->assertCreated()->json('data.id');
    $this->post("/api/discussions/{$discussion}/comments", [
        'content' => 'Reply', 'parent_id' => $parent,
        'files' => [UploadedFile::fake()->image('board.png')],
    ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.attachments.0.is_image', true);

    $this->getJson("/api/discussions/{$discussion}")->assertOk()->assertJsonCount(2, 'data.comments')->assertJsonPath('data.comments.1.parent_id', $parent);
});

it('lets members upload project files but not outsiders', function () {
    Storage::fake('local');
    $company = Company::factory()->create();
    $project = projectOf($company);
    $member = staffMember($company);
    $project->members()->create(['user_id' => $member->id]);

    signIn(staffMember($company));
    $this->post("/api/projects/{$project->id}/files", ['files' => [UploadedFile::fake()->create('a.txt', 1)]], ['Accept' => 'application/json'])->assertForbidden();

    signIn($member);
    $this->post("/api/projects/{$project->id}/files", ['files' => [UploadedFile::fake()->create('a.txt', 1)]], ['Accept' => 'application/json'])->assertCreated();
    $this->postJson("/api/projects/{$project->id}/files/link", ['name' => 'Figma', 'external_link' => 'https://figma.com/file/x'])->assertCreated();
    $this->getJson("/api/projects/{$project->id}/files")->assertJsonCount(2, 'data');
});

it('lets only admins manage staff permissions', function () {
    $admin = companyAdmin();
    $staff = staffMember($admin->company);

    signIn($staff);
    $this->getJson('/api/settings/permissions')->assertForbidden();

    signIn($admin);
    $this->putJson("/api/settings/permissions/{$staff->id}", ['permissions' => ['projects.create', 'tasks.view']])->assertOk();
    $this->getJson('/api/settings/permissions')->assertOk()->assertJsonFragment(['permissions' => ['projects.create', 'tasks.view']]);
});

it('builds the Perfex gantt grouped by milestone, member or status and saves dragged dates', function () {
    $admin = signIn(companyAdmin());
    $dev = staffMember($admin->company);
    $project = projectOf($admin->company);
    $project->members()->create(['user_id' => $dev->id]);
    $milestone = $project->milestones()->create(['name' => 'M1', 'due_date' => today()->addDays(3)]);
    $inMilestone = Task::factory()->for($project)->create(['milestone_id' => $milestone->id, 'status' => TaskStatus::InProgress]);
    $inMilestone->assignees()->create(['user_id' => $dev->id]);
    $loose = Task::factory()->for($project)->create(['status' => TaskStatus::Complete]);

    $this->getJson("/api/projects/{$project->id}/gantt")->assertOk()
        ->assertJsonPath('data.groups.0.name', 'Uncategorized')->assertJsonPath('data.groups.0.tasks.0.id', $loose->id)
        ->assertJsonPath('data.groups.1.name', 'M1')->assertJsonPath('data.groups.1.end', today()->addDays(3)->toDateString())
        ->assertJsonPath('data.groups.1.tasks.0.can_move', true);
    $this->getJson("/api/projects/{$project->id}/gantt?type=members")
        ->assertJsonPath('data.groups.0.name', 'Not assigned')->assertJsonPath('data.groups.1.name', $dev->full_name);
    $this->getJson("/api/projects/{$project->id}/gantt?type=status")
        ->assertJsonCount(2, 'data.groups')->assertJsonPath('data.groups.0.name', 'In Progress');
    $this->getJson("/api/projects/{$project->id}/gantt?status=5")->assertJsonCount(1, 'data.groups')->assertJsonPath('data.groups.0.tasks.0.id', $loose->id);

    $this->postJson("/api/tasks/{$loose->id}/dates", ['start_date' => '2026-12-01', 'due_date' => '2026-12-05'])->assertOk();
    expect($loose->refresh()->start_date->toDateString())->toBe('2026-12-01')->and($loose->due_date->toDateString())->toBe('2026-12-05');
    $this->postJson("/api/tasks/{$loose->id}/dates", ['start_date' => '2026-12-05', 'due_date' => '2026-12-01'])->assertJsonValidationErrors('due_date');
});

it('lists the company\'s HRMS employees for pickers, including new ones', function () {
    $admin = signIn(companyAdmin());
    staffMember($admin->company);
    companyAdmin(); // another company

    $this->getJson('/api/staff')->assertOk()->assertJsonCount(2, 'data');
});
