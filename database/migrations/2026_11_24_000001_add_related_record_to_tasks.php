<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfex "Related to": besides a project or a lead, a task can belong to a customer, invoice,
 * estimate, proposal, contract, ticket or expense.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('rel_type', 30)->nullable()->after('lead_id');
            $table->unsignedBigInteger('rel_id')->nullable()->after('rel_type');
            $table->index(['company_id', 'rel_type', 'rel_id']);
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'rel_type', 'rel_id']);
            $table->dropColumn(['rel_type', 'rel_id']);
        });
    }
};
