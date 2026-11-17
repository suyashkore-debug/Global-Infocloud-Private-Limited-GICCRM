<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A logo uploaded in the CRM (Setup → Company Information or the sign-up form); it wins over
     * the HRMS logo and HrmsSync never touches it.
     */
    public function up(): void
    {
        Schema::table('crm_companies', function (Blueprint $table) {
            $table->string('crm_logo')->nullable()->after('logo');
        });
    }

    public function down(): void
    {
        Schema::table('crm_companies', function (Blueprint $table) {
            $table->dropColumn('crm_logo');
        });
    }
};
