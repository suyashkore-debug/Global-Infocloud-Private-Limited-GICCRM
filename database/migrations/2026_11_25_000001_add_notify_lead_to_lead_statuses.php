<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per lead status: whether a lead moved to it gets the status-update e-mail / WhatsApp message.
 * On for every status except the converted-customer one and dead / lost / junk ones.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_statuses', function (Blueprint $table) {
            $table->boolean('notify_lead')->default(true)->after('is_default');
        });

        DB::table('lead_statuses')
            ->where(fn ($q) => $q->where('is_default', true)->orWhere('name', 'like', '%dead%')->orWhere('name', 'like', '%lost%')->orWhere('name', 'like', '%junk%'))
            ->update(['notify_lead' => false]);
    }

    public function down(): void
    {
        Schema::table('lead_statuses', function (Blueprint $table) {
            $table->dropColumn('notify_lead');
        });
    }
};
