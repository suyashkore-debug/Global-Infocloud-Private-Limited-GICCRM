<?php

namespace Database\Factories;

use App\Enums\BillingType;
use App\Enums\ProjectStatus;
use App\Models\Customer;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Project>
 */
class ProjectFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'company_id' => fn (array $attributes) => Customer::withoutGlobalScopes()->find($attributes['customer_id'])?->company_id ?? 1,
            'name' => fake()->catchPhrase(),
            'status' => ProjectStatus::InProgress,
            'billing_type' => BillingType::FixedRate,
            'project_cost' => 50000,
            'start_date' => today()->subDays(10),
            'deadline' => today()->addDays(20),
            'progress_from_tasks' => true,
            'created_by' => 0,
        ];
    }
}
