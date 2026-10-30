<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex "Use Google reCAPTCHA" on each web form (lead and estimate request forms).
     */
    public function up(): void
    {
        foreach (['lead_forms', 'estimate_request_forms'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->boolean('recaptcha')->default(false)->after('active');
            });
        }
    }

    public function down(): void
    {
        foreach (['lead_forms', 'estimate_request_forms'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropColumn('recaptcha');
            });
        }
    }
};
