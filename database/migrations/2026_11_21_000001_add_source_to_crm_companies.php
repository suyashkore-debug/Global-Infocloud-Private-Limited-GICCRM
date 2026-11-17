<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Companies can sign up in the CRM (/newcompany): source "crm", ids from 1000001 so they never
     * meet an HRMS company id.
     */
    public function up(): void
    {
        Schema::table('crm_companies', function (Blueprint $table) {
            $table->string('source', 10)->default('hrms')->after('id')->index();
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE crm_companies AUTO_INCREMENT = 1000001');
        }
    }

    public function down(): void
    {
        Schema::table('crm_companies', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
