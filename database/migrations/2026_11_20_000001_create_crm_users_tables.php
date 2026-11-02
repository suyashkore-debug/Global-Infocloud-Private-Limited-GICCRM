<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The CRM's own staff accounts: HRMS users are copied in with their HRMS id (source "hrms",
     * kept in step by HrmsSync) and staff created in the CRM live only here (source "crm", ids from
     * 1000001 so they never meet an HRMS id). Companies, roles and login tokens move here too, so
     * the CRM keeps working when HRMS is unreachable.
     */
    public function up(): void
    {
        Schema::create('crm_companies', function (Blueprint $table) {
            $table->id();
            $table->string('company_name');
            $table->string('public_careers_slug')->nullable();
            $table->string('short_code')->nullable();
            $table->string('logo')->nullable();
            $table->string('status', 20)->default('active');
            $table->timestamp('hrms_synced_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('crm_users', function (Blueprint $table) {
            $table->id();
            // hrms: a copy of the HRMS account; crm: created in the CRM only.
            $table->string('source', 10)->default('hrms')->index();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->string('employee_code')->nullable();
            $table->string('username', 100)->nullable()->unique();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('full_name')->nullable();
            $table->string('email')->nullable()->index();
            $table->string('mobile', 20)->nullable();
            $table->string('profile_photo')->nullable();
            // CRM accounts: their password; HRMS accounts: the HRMS hash, used only while HRMS is down.
            $table->string('password')->nullable();
            $table->boolean('is_company_admin')->default(false);
            $table->boolean('is_super_admin')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->unsignedSmallInteger('failed_logins')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('hrms_synced_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE crm_users AUTO_INCREMENT = 1000001');
        }

        Schema::create('crm_roles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('crm_user_roles', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('role_id');
            $table->primary(['user_id', 'role_id']);
        });

        Schema::create('crm_personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            // The HRMS token of an HRMS login (encrypted), for HRMS profile calls and logout.
            $table->text('hrms_token')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['crm_personal_access_tokens', 'crm_user_roles', 'crm_roles', 'crm_users', 'crm_companies'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
