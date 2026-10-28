<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex customers area: contacts log in with their own password, have portal permissions,
     * and projects decide what the customer may see.
     */
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('password')->nullable()->after('email');
            $table->timestamp('last_login_at')->nullable();
            $table->timestamp('last_password_change_at')->nullable();
            // invoices, estimates, contracts, proposals, support, projects
            $table->json('permissions')->nullable();
        });

        // Portal sessions. Kept here, not in HRMS's token table: contacts are not HRMS users.
        Schema::create('contact_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        // "Set / reset your password" links.
        Schema::create('contact_password_resets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->json('customer_settings')->nullable();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->boolean('visible_to_client')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('tasks', fn (Blueprint $table) => $table->dropColumn('visible_to_client'));
        Schema::table('projects', fn (Blueprint $table) => $table->dropColumn('customer_settings'));
        Schema::dropIfExists('contact_password_resets');
        Schema::dropIfExists('contact_tokens');
        Schema::table('contacts', fn (Blueprint $table) => $table->dropColumn(['password', 'last_login_at', 'last_password_change_at', 'permissions']));
    }
};
