<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex knowledge base and utilities: announcements, calendar events, the activity log,
     * the media library and goals.
     */
    public function up(): void
    {
        Schema::create('kb_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 300);
            $table->text('description')->nullable();
            $table->string('color', 10)->default('#28B8DA');
            $table->boolean('active')->default(true);
            $table->unsignedInteger('group_order')->default(0);
            $table->timestamps();
        });

        Schema::create('kb_articles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('kb_group_id')->constrained()->cascadeOnDelete();
            $table->string('subject', 500);
            $table->string('slug', 520);
            $table->longText('description')->nullable();
            $table->boolean('active')->default(true);
            // Perfex "Internal article": only staff can read it.
            $table->boolean('staff_article')->default(false);
            $table->unsignedInteger('article_order')->default(0);
            $table->unsignedInteger('views')->default(0);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('kb_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kb_article_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->boolean('helpful');
            $table->timestamps();
            $table->unique(['kb_article_id', 'user_id']);
        });

        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 300);
            $table->text('message');
            $table->boolean('show_to_staff')->default(true);
            $table->boolean('show_to_customers')->default(false);
            $table->boolean('show_name')->default(false);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('announcement_dismissals', function (Blueprint $table) {
            $table->foreignId('announcement_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
            $table->primary(['announcement_id', 'user_id']);
        });

        Schema::create('calendar_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('title', 300);
            $table->text('description')->nullable();
            $table->dateTime('start');
            $table->dateTime('end')->nullable();
            $table->boolean('public')->default(false);
            $table->string('color', 10)->default('#28B8DA');
            $table->unsignedInteger('reminder_before')->default(0);
            $table->string('reminder_before_type', 10)->default('minutes');
            $table->boolean('start_notified')->default(false);
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
        });

        Schema::create('activity_log', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('description', 1000);
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('media', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('folder', 191)->default('');
            $table->string('disk_path');
            $table->string('original_name');
            $table->string('mime_type', 150)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
        });

        Schema::create('goals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('subject', 400);
            $table->text('description')->nullable();
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedTinyInteger('goal_type');
            $table->foreignId('contract_type_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('achievement', 15, 2);
            $table->boolean('notify_when_fail')->default(true);
            $table->boolean('notify_when_achieve')->default(true);
            $table->boolean('notified')->default(false);
            // 0 / null = the whole company; otherwise the goal of one staff member.
            $table->unsignedBigInteger('staff_id')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['goals', 'media', 'activity_log', 'calendar_events', 'announcement_dismissals', 'announcements', 'kb_feedback', 'kb_articles', 'kb_groups'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
