<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex "Schedule" in Send to Email: an invoice or estimate e-mail sent later by the scheduler.
     */
    public function up(): void
    {
        Schema::create('scheduled_emails', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            // invoices or estimates (the Send to Email type).
            $table->string('rel_type', 30);
            $table->unsignedBigInteger('rel_id');
            $table->timestamp('scheduled_at')->index();
            $table->json('recipients');
            $table->string('cc', 1000)->nullable();
            $table->boolean('attach_pdf')->default(true);
            $table->string('subject', 500)->nullable();
            $table->mediumText('message')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->unique(['rel_type', 'rel_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduled_emails');
    }
};
