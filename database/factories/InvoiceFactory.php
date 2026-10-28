<?php

namespace Database\Factories;

use App\Enums\InvoiceStatus;
use App\Models\Customer;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Invoice>
 */
class InvoiceFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'company_id' => fn (array $attributes) => Customer::withoutGlobalScopes()->find($attributes['customer_id'])?->company_id ?? 1,
            'number' => fake()->unique()->numberBetween(1, 99999),
            'prefix' => 'INV-',
            'date' => today(),
            'due_date' => today()->addDays(30),
            'status' => InvoiceStatus::Unpaid,
            'total' => 1000,
            'subtotal' => 1000,
            'hash' => Str::random(32),
            'created_by' => 0,
        ];
    }
}
