<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Calls with a lead, logged by staff from the lead's Call tab.
     */
    public function up(): void
    {
        Schema::create('lead_calls', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedBigInteger('lead_id')->index();
            $table->unsignedBigInteger('user_id');
            $table->enum('direction', ['out', 'in'])->default('out');
            // answered, no_answer, busy, switched_off, wrong_number, callback
            $table->string('outcome', 30);
            $table->dateTime('called_at');
            $table->unsignedInteger('duration_minutes')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_calls');
    }
};
