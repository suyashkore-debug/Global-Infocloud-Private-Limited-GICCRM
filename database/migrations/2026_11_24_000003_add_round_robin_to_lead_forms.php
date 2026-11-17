<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A web form can share its leads out among several staff in turn (round-robin): who is in the turn,
 * and who got the last lead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_forms', function (Blueprint $table) {
            $table->json('assignee_ids')->nullable()->after('responsible_id');
            $table->unsignedBigInteger('last_assigned_id')->nullable()->after('assignee_ids');
        });
    }

    public function down(): void
    {
        Schema::table('lead_forms', function (Blueprint $table) {
            $table->dropColumn(['assignee_ids', 'last_assigned_id']);
        });
    }
};
