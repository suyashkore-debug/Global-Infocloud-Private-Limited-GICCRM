<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stand-in for the HRMS tables this app reads (only the columns it uses), created in the test
 * database through the "hrms" connection. The real tables are owned by HRMS and never migrated here.
 */
class HrmsTestDatabase
{
    public static function reset(): void
    {
        if (config('database.connections.hrms.database') !== config('database.connections.mysql.database')) {
            throw new \RuntimeException('Tests must point the hrms connection at the test database.');
        }

        $schema = Schema::connection('hrms');

        foreach (['user_roles', 'roles', 'personal_access_tokens', 'users', 'companies'] as $table) {
            $schema->dropIfExists($table);
        }

        $schema->create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('company_name');
            $table->string('public_careers_slug')->nullable();
            $table->string('short_code')->nullable();
            $table->string('logo')->nullable();
            $table->enum('status', ['active', 'inactive', 'blocked', 'suspended'])->default('active');
            $table->timestamps();
            $table->softDeletes();
        });

        $schema->create('users', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('employee_code')->nullable();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('full_name')->nullable();
            $table->string('email')->nullable();
            $table->string('mobile', 20)->nullable();
            $table->string('profile_photo')->nullable();
            $table->string('password');
            $table->boolean('is_company_admin')->default(false);
            $table->boolean('is_super_admin')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        $schema->create('roles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        $schema->create('user_roles', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('role_id');
        });

        $schema->create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }
}
