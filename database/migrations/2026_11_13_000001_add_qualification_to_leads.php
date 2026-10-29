<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lead qualification: which of the five criteria (Lead::QUALIFICATION) the lead meets. The
     * number met is the lead's star rating (0-5).
     */
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->json('qualification')->nullable()->after('lead_value');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropColumn('qualification');
        });
    }
};
