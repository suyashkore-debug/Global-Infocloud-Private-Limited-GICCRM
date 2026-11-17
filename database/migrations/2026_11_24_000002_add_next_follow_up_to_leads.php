<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A lead's next follow-up (as TeleCRM): when to get back to it, what about, who set it, and
 * whether the reminder has gone out.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->timestamp('next_follow_up_at')->nullable()->after('last_contact_at');
            $table->string('follow_up_note', 500)->nullable()->after('next_follow_up_at');
            $table->unsignedBigInteger('follow_up_by')->nullable()->after('follow_up_note');
            $table->timestamp('follow_up_notified_at')->nullable()->after('follow_up_by');
            $table->index(['company_id', 'next_follow_up_at']);
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'next_follow_up_at']);
            $table->dropColumn(['next_follow_up_at', 'follow_up_note', 'follow_up_by', 'follow_up_notified_at']);
        });
    }
};
