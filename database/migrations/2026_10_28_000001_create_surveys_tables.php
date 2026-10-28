<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex surveys module: surveys with questions, participants' answers, mail lists and the
     * log of survey e-mails sent.
     */
    public function up(): void
    {
        Schema::create('surveys', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('subject', 500);
            $table->string('slug', 520);
            // Body of the invitation e-mail.
            $table->text('description')->nullable();
            // Shown to participants above the questions.
            $table->text('view_description')->nullable();
            $table->string('from_name', 100)->nullable();
            $table->string('redirect_url', 500)->nullable();
            $table->boolean('ip_restrict')->default(false);
            $table->boolean('only_for_logged_in')->default(false);
            $table->boolean('active')->default(true);
            $table->string('hash', 32);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('survey_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('survey_id')->constrained()->cascadeOnDelete();
            // checkbox, radio, input, textarea
            $table->string('type', 20);
            $table->text('question');
            $table->boolean('required')->default(false);
            $table->unsignedInteger('question_order')->default(0);
            $table->timestamps();
        });

        Schema::create('survey_question_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('survey_question_id')->constrained()->cascadeOnDelete();
            $table->string('description', 500);
            $table->unsignedInteger('option_order')->default(0);
        });

        Schema::create('survey_result_sets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('survey_id')->constrained()->cascadeOnDelete();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 150)->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('survey_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('survey_result_set_id')->constrained()->cascadeOnDelete();
            $table->foreignId('survey_question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('survey_question_option_id')->nullable()->constrained()->cascadeOnDelete();
            $table->text('answer')->nullable();
        });

        Schema::create('mail_lists', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 191);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('mail_list_emails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mail_list_id')->constrained()->cascadeOnDelete();
            $table->string('email', 191);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['mail_list_id', 'email']);
        });

        Schema::create('survey_send_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('survey_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('total')->default(0);
            $table->unsignedInteger('sent')->default(0);
            $table->json('lists')->nullable();
            $table->boolean('finished')->default(false);
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['survey_send_logs', 'mail_list_emails', 'mail_lists', 'survey_answers', 'survey_result_sets', 'survey_question_options', 'survey_questions', 'surveys'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
