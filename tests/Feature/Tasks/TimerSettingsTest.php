<?php

use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Services\Options;

it('stops task timers that ran past the company limit at start + limit', function () {
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id])))->create();
    $old = TaskTimer::create(['company_id' => $admin->company_id, 'task_id' => $task->id, 'user_id' => $admin->id, 'start_time' => now()->subHours(12)]);
    $fresh = TaskTimer::create(['company_id' => $admin->company_id, 'task_id' => $task->id, 'user_id' => $admin->id, 'start_time' => now()->subHours(2)]);
    $blank = TaskTimer::create(['company_id' => $admin->company_id, 'task_id' => null, 'user_id' => $admin->id, 'start_time' => now()->subHours(12)]);

    $other = companyAdmin();
    Options::set('automatically_stop_task_timer_after_hours', '0', $other->company_id);
    $otherTask = Task::factory()->for(Project::factory()->for(Customer::factory()->state(['company_id' => $other->company_id])))->create();
    $kept = TaskTimer::create(['company_id' => $other->company_id, 'task_id' => $otherTask->id, 'user_id' => $other->id, 'start_time' => now()->subHours(30)]);

    $this->artisan('timers:auto-stop')->assertSuccessful();

    expect($old->refresh()->end_time->equalTo($old->start_time->copy()->addHours(10)))->toBeTrue()
        ->and($fresh->refresh()->end_time)->toBeNull()
        ->and($blank->refresh()->end_time)->toBeNull()
        ->and($kept->refresh()->end_time)->toBeNull();
});

it('rounds logged time the way Settings → Tasks says', function () {
    $admin = signIn(companyAdmin());
    $task = Task::factory()->for(Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id])))->create();
    TaskTimer::create(['company_id' => $admin->company_id, 'task_id' => $task->id, 'user_id' => $admin->id, 'start_time' => now()->subMinutes(22), 'end_time' => now()]);

    $total = fn () => $task->fresh()->load('timers')->totalLoggedSeconds();
    expect($total())->toBe(22 * 60);

    $this->putJson('/api/setup/options', ['options' => ['round_off_task_timer_option' => '1', 'round_off_task_timer_time' => '15']])->assertOk();
    Options::flush();
    expect($total())->toBe(30 * 60);

    Options::set('round_off_task_timer_option', '2');
    expect($total())->toBe(15 * 60);

    Options::set('round_off_task_timer_option', '3');
    Options::set('round_off_task_timer_time', '10');
    expect($total())->toBe(20 * 60);
});
