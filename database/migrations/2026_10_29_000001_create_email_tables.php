<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex e-mail templates (per company, seeded with GIC's templates) and a log of every
     * e-mail sent.
     */
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('type', 40);
            $table->string('slug', 100);
            $table->string('name', 191);
            $table->string('subject', 500);
            $table->longText('message');
            $table->string('from_name', 191)->nullable();
            $table->boolean('plaintext')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['company_id', 'slug']);
        });

        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('template', 100)->nullable();
            $table->string('to', 500);
            $table->string('cc', 500)->nullable();
            $table->string('subject', 500);
            $table->string('rel_type', 40)->nullable();
            $table->unsignedBigInteger('rel_id')->nullable();
            // queued, sent, failed
            $table->string('status', 20)->default('queued');
            $table->text('error')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();
            $table->index(['rel_type', 'rel_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('email_templates');
    }
};
