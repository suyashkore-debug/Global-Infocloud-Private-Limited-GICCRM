<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * When someone opened the lead's Call tab after this call was logged. Calls logged by the phone
     * system (Exotel) start unseen, so the tab can show there is something new.
     */
    public function up(): void
    {
        Schema::table('lead_calls', function (Blueprint $table) {
            $table->timestamp('seen_at')->nullable()->after('notes');
        });
        // Calls already there are not "new".
        DB::table('lead_calls')->update(['seen_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('lead_calls', function (Blueprint $table) {
            $table->dropColumn('seen_at');
        });
    }
};
