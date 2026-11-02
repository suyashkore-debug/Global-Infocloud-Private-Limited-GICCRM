<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A lead's first and last name; name stays the full name (search, lists, e-mails).
     */
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('first_name', 191)->nullable()->after('name');
            $table->string('last_name', 191)->nullable()->after('first_name');
        });

        // Existing leads: the first word is the first name, the rest the last name.
        DB::table('leads')->orderBy('id')->select(['id', 'name'])->each(function ($lead) {
            [$first, $last] = array_pad(explode(' ', trim((string) $lead->name), 2), 2, null);
            DB::table('leads')->where('id', $lead->id)->update(['first_name' => mb_substr((string) $first, 0, 191) ?: null, 'last_name' => $last !== null ? mb_substr(trim($last), 0, 191) : null]);
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'last_name']);
        });
    }
};
