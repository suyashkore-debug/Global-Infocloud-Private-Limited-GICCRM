<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lead pipelines (TeleCRM "workspaces"): Sales, Post-sales, Support… each with its own statuses
 * and team. A status can move a lead on to another pipeline (e.g. Won → Post-sales) and assign it.
 * Every company's existing statuses become its "Sales" pipeline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_pipelines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 100);
            $table->string('color', 7)->default('#0b2c56');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_default')->default(false);
            // The pipeline's team: who sees it (empty = everyone) and who its leads are shared out to.
            $table->json('member_ids')->nullable();
            $table->unsignedBigInteger('last_assigned_id')->nullable();
            $table->timestamps();
        });

        Schema::table('lead_statuses', function (Blueprint $table) {
            $table->unsignedBigInteger('pipeline_id')->nullable()->index()->after('company_id');
            // On reaching this status: move the lead to another status (in another pipeline) and assign it.
            $table->unsignedBigInteger('move_to_status_id')->nullable()->after('notify_lead');
            $table->string('move_assign', 10)->default('keep')->after('move_to_status_id');
            $table->unsignedBigInteger('move_assign_user_id')->nullable()->after('move_assign');
        });

        $now = now();
        foreach (DB::table('lead_statuses')->distinct()->pluck('company_id') as $company) {
            $id = DB::table('lead_pipelines')->insertGetId(['company_id' => $company, 'name' => 'Sales', 'color' => '#0b2c56', 'sort_order' => 0, 'is_default' => true, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('lead_statuses')->where('company_id', $company)->update(['pipeline_id' => $id]);
        }
    }

    public function down(): void
    {
        Schema::table('lead_statuses', function (Blueprint $table) {
            $table->dropColumn(['pipeline_id', 'move_to_status_id', 'move_assign', 'move_assign_user_id']);
        });
        Schema::dropIfExists('lead_pipelines');
    }
};
