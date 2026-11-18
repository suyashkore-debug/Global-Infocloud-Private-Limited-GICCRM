<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Setup per workspace: a workspace's own settings (options rows with its workspace_id; rows
 * without one are the default workspace's, which the others follow until they change a setting),
 * its own e-mail templates and log, and lists whose items are for one workspace or (null) all.
 * Staff, permissions and the company's details stay common.
 */
return new class extends Migration
{
    /** Lists whose items are for one workspace, or all (null). */
    private const LISTS = [
        'currencies', 'taxes', 'payment_modes', 'item_groups', 'customer_groups', 'expense_categories', 'vendor_categories',
        'contract_types', 'lead_sources', 'ticket_statuses', 'estimate_request_statuses', 'ticket_priorities', 'ticket_services',
        'predefined_replies', 'support_departments', 'tags', 'custom_fields', 'email_logs',
    ];

    public function up(): void
    {
        Schema::table('options', function (Blueprint $table) {
            $table->foreignId('workspace_id')->nullable()->after('company_id');
        });
        Schema::table('options', function (Blueprint $table) {
            $table->index('company_id');
            $table->dropUnique(['company_id', 'name']);
            $table->unique(['company_id', 'workspace_id', 'name']);
        });

        Schema::table('email_templates', function (Blueprint $table) {
            $table->foreignId('workspace_id')->nullable()->after('company_id');
        });
        Schema::table('email_templates', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'slug']);
            $table->unique(['company_id', 'workspace_id', 'slug']);
        });

        foreach (self::LISTS as $name) {
            if (Schema::hasTable($name) && ! Schema::hasColumn($name, 'workspace_id')) {
                Schema::table($name, function (Blueprint $table) {
                    $table->foreignId('workspace_id')->nullable()->index();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (self::LISTS as $name) {
            if (Schema::hasColumn($name, 'workspace_id')) {
                Schema::table($name, function (Blueprint $table) {
                    $table->dropIndex(['workspace_id']);
                    $table->dropColumn('workspace_id');
                });
            }
        }
        \Illuminate\Support\Facades\DB::table('email_templates')->whereNotNull('workspace_id')->delete();
        Schema::table('email_templates', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'workspace_id', 'slug']);
            $table->unique(['company_id', 'slug']);
            $table->dropColumn('workspace_id');
        });
        \Illuminate\Support\Facades\DB::table('options')->whereNotNull('workspace_id')->delete();
        Schema::table('options', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'workspace_id', 'name']);
            $table->unique(['company_id', 'name']);
            $table->dropIndex(['company_id']);
            $table->dropColumn('workspace_id');
        });
    }
};
