<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * Builds HRMS users for tests only; real users are created in HRMS.
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $firstName = fake()->firstName();
        $lastName = fake()->lastName();

        return [
            'company_id' => Company::factory(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'full_name' => $firstName.' '.$lastName,
            'email' => fake()->unique()->safeEmail(),
            'mobile' => fake()->unique()->numerify('9#########'),
            'password' => static::$password ??= Hash::make('password'),
            'is_active' => true,
            'is_company_admin' => false,
            'is_super_admin' => false,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['is_active' => false]);
    }

    public function companyAdmin(): static
    {
        return $this->state(fn (array $attributes) => ['is_company_admin' => true]);
    }
}
