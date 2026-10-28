<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfex lets staff start a timer from the header before choosing a task; the task is picked
 * when the timer is stopped. Such timers have no task, so they carry their own company.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_timers', function (Blueprint $table) {
            $table->unsignedBigInteger('task_id')->nullable()->change();
            $table->unsignedBigInteger('company_id')->nullable()->after('id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('task_timers', function (Blueprint $table) {
            $table->dropColumn('company_id');
        });
    }
};
