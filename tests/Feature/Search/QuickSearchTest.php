<?php

use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;

it('finds records across the CRM for the header quick search', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Zephyr Traders']);
    $project = Project::factory()->for($customer)->create(['name' => 'Zephyr Website']);
    Task::factory()->for($project)->create(['name' => 'Design Zephyr logo']);

    $other = companyAdmin();
    $foreign = Customer::factory()->create(['company_id' => $other->company_id, 'name' => 'Zephyr Elsewhere']);
    Project::factory()->for($foreign)->create(['name' => 'Zephyr Foreign']);

    $this->getJson('/api/search?q=zephyr')->assertOk()
        ->assertJsonCount(1, 'data.customers')->assertJsonPath('data.customers.0.url', "/customers/{$customer->id}")
        ->assertJsonCount(1, 'data.projects')->assertJsonPath('data.projects.0.subtitle', 'Zephyr Traders')
        ->assertJsonCount(1, 'data.tasks')->assertJsonPath('data.tasks.0.title', fn ($t) => str_ends_with($t, 'Design Zephyr logo'));

    $this->getJson("/api/search?q=%23{$project->id}")->assertJsonPath('data.projects.0.id', $project->id);
    $this->getJson('/api/search?q=z')->assertExactJson(['data' => []]);
});

it('only shows what the user may open', function () {
    $admin = companyAdmin();
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Quokka Ltd']);
    Project::factory()->for($customer)->create(['name' => 'Quokka App']);

    signIn(staffMember($admin->company));
    $this->getJson('/api/search?q=quokka')->assertOk()->assertJsonMissingPath('data.customers')->assertJsonMissingPath('data.projects');
});
