<?php

use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;

it('saves list filters privately or for the team, with a default per person', function () {
    $admin = companyAdmin();
    $asha = staffMember($admin->company);
    $ravi = staffMember($admin->company);

    signIn($asha);
    $mine = $this->postJson('/api/saved-filters', ['identifier' => 'tasks', 'name' => 'My Tasks', 'filters' => ['filter' => 'my_tasks', 'statuses' => [1, 4]], 'is_default' => true])
        ->assertCreated()->assertJsonPath('data.is_default', true)->assertJsonPath('data.filters.statuses.1', 4)->json('data.id');
    $shared = $this->postJson('/api/saved-filters', ['identifier' => 'invoices', 'name' => 'FY 24-25', 'filters' => ['from' => '2024-04-01', 'to' => '2025-03-31'], 'is_shared' => true])->assertCreated()->json('data.id');
    $this->postJson('/api/saved-filters', ['identifier' => 'payroll', 'name' => 'x', 'filters' => []])->assertJsonValidationErrors('identifier');

    signIn($ravi);
    $this->getJson('/api/saved-filters?identifier=tasks')->assertJsonCount(0, 'data');
    $this->getJson('/api/saved-filters?identifier=invoices')->assertJsonPath('data.0.name', 'FY 24-25')->assertJsonPath('data.0.can_manage', false)->assertJsonPath('data.0.author', $asha->full_name);
    $this->putJson("/api/saved-filters/{$shared}", ['is_default' => true])->assertOk()->assertJsonPath('data.is_default', true);
    $this->putJson("/api/saved-filters/{$shared}", ['name' => 'Mine'])->assertForbidden();
    $this->putJson("/api/saved-filters/{$mine}", ['is_default' => true])->assertForbidden();
    $this->deleteJson("/api/saved-filters/{$shared}")->assertForbidden();

    signIn($asha);
    $this->getJson('/api/saved-filters?identifier=invoices')->assertJsonPath('data.0.is_default', false);
    $this->putJson("/api/saved-filters/{$mine}", ['is_default' => false])->assertJsonPath('data.is_default', false);

    signIn($admin);
    $this->deleteJson("/api/saved-filters/{$shared}")->assertOk();
    signIn($ravi);
    $this->getJson('/api/saved-filters?identifier=invoices')->assertJsonCount(0, 'data');
});

it('filters tasks by start date range', function () {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    Task::factory()->for($project)->create(['start_date' => '2025-10-20']);
    $nov = Task::factory()->for($project)->create(['start_date' => '2025-11-05']);

    $this->getJson('/api/tasks?start_from=2025-11-01&status[]=1&status[]=2&status[]=3&status[]=4&status[]=5')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $nov->id);
});
