<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Workspaces for the whole CRM (not only leads): customers, sales documents, projects, tasks,
 * tickets, contracts, expenses, estimate requests, goals, calendar events, accounting entries,
 * vendors and purchases each belong to a workspace. Everything there is goes into each company's
 * default workspace ("Sales"), made where a company has none yet. Setup and staff stay common.
 */
return new class extends Migration
{
    public const TABLES = [
        'customers', 'proposals', 'estimates', 'invoices', 'payments', 'credit_notes', 'expenses', 'contracts',
        'projects', 'tasks', 'tickets', 'estimate_requests', 'goals', 'calendar_events',
        'journal_entries', 'account_transactions', 'account_transfers',
        'vendors', 'purchase_requests', 'purchase_orders', 'purchase_invoices',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->unsignedBigInteger('workspace_id')->nullable()->index()->after('company_id');
            });
        }

        $now = now();
        $companies = collect(self::TABLES)->flatMap(fn ($t) => DB::table($t)->distinct()->pluck('company_id'))->filter()->unique();
        foreach ($companies as $company) {
            $default = DB::table('lead_pipelines')->where('company_id', $company)->orderByDesc('is_default')->orderBy('sort_order')->value('id')
                ?? DB::table('lead_pipelines')->insertGetId(['company_id' => $company, 'name' => 'Sales', 'color' => '#0b2c56', 'sort_order' => 0, 'is_default' => true, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('lead_statuses')->where('company_id', $company)->whereNull('pipeline_id')->update(['pipeline_id' => $default]);
            foreach (self::TABLES as $table) {
                DB::table($table)->where('company_id', $company)->whereNull('workspace_id')->update(['workspace_id' => $default]);
            }
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('workspace_id');
            });
        }
    }
};
