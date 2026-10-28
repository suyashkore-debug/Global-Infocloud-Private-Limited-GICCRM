<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Calls made and received through a calling provider (Exotel) are logged automatically:
     * the provider's call id and status, talk time and recording. An incoming call from a number
     * that matches no lead is kept without a lead.
     */
    public function up(): void
    {
        Schema::table('lead_calls', function (Blueprint $table) {
            $table->unsignedBigInteger('lead_id')->nullable()->change();
            $table->unsignedBigInteger('user_id')->nullable()->change();
            // manual (logged by hand) or the provider, e.g. exotel.
            $table->string('source', 20)->default('manual')->after('user_id');
            $table->string('provider_call_id', 100)->nullable()->unique()->after('source');
            $table->string('provider_status', 30)->nullable()->after('provider_call_id');
            // The lead's and the staff member's numbers as the provider reported them.
            $table->string('lead_number', 32)->nullable()->index()->after('provider_status');
            $table->string('agent_number', 32)->nullable()->after('lead_number');
            $table->unsignedInteger('talk_seconds')->nullable()->after('duration_minutes');
            $table->text('recording_url')->nullable()->after('talk_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('lead_calls', function (Blueprint $table) {
            $table->dropUnique(['provider_call_id']);
            $table->dropIndex(['lead_number']);
            $table->dropColumn(['source', 'provider_call_id', 'provider_status', 'lead_number', 'agent_number', 'talk_seconds', 'recording_url']);
        });
    }
};
