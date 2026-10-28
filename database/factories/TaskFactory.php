<?php

namespace Database\Factories;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'company_id' => fn (array $attributes) => Project::withoutGlobalScopes()->find($attributes['project_id'])?->company_id ?? 1,
            'name' => fake()->sentence(4),
            'priority' => TaskPriority::Medium,
            'status' => TaskStatus::NotStarted,
            'start_date' => today(),
            'due_date' => today()->addDays(5),
            'created_by' => 0,
        ];
    }
}
