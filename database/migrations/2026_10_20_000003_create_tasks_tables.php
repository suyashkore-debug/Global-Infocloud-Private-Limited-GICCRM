<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('project_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('milestone_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 500);
            $table->text('description')->nullable();
            $table->unsignedTinyInteger('priority')->default(2);
            $table->unsignedTinyInteger('status')->default(1);
            $table->date('start_date');
            $table->date('due_date')->nullable();
            $table->dateTime('date_finished')->nullable();
            $table->boolean('is_public')->default(false);
            $table->boolean('billable')->default(false);
            $table->decimal('hourly_rate', 15, 2)->default(0);
            $table->unsignedInteger('kanban_order')->default(1);
            $table->unsignedInteger('milestone_order')->default(0);
            // Recurring: repeat every N day/week/month/year, for `cycles` times (0 = forever).
            $table->unsignedInteger('repeat_every')->nullable();
            $table->string('recurring_type', 10)->nullable();
            $table->unsignedInteger('cycles')->default(0);
            $table->unsignedInteger('total_cycles')->default(0);
            $table->date('last_recurring_date')->nullable();
            $table->foreignId('recurring_from_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'status']);
        });

        Schema::create('task_assignees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->index();
            $table->unsignedBigInteger('assigned_by')->nullable();
            $table->timestamps();
            $table->unique(['task_id', 'user_id']);
        });

        Schema::create('task_followers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->index();
            $table->timestamps();
            $table->unique(['task_id', 'user_id']);
        });

        Schema::create('task_checklist_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->text('description');
            $table->boolean('finished')->default(false);
            $table->unsignedBigInteger('finished_by')->nullable();
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->unsignedInteger('list_order')->default(0);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('checklist_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->text('description');
            $table->timestamps();
        });

        Schema::create('task_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->text('content');
            $table->timestamps();
        });

        Schema::create('task_timers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->index();
            $table->dateTime('start_time');
            $table->dateTime('end_time')->nullable();
            $table->decimal('hourly_rate', 15, 2)->default(0);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'end_time']);
        });

        Schema::create('task_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('created_by');
            $table->dateTime('remind_at');
            $table->text('description')->nullable();
            $table->boolean('notify_by_email')->default(false);
            $table->boolean('is_notified')->default(false);
            $table->timestamps();
        });

        // Project files, task attachments and discussion comment attachments.
        Schema::create('files', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->morphs('attachable');
            $table->foreignId('project_id')->nullable()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->string('disk_path')->nullable();
            $table->string('original_name');
            $table->string('mime_type', 150)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->string('subject', 500)->nullable();
            $table->text('description')->nullable();
            $table->text('external_link')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('files');
        Schema::dropIfExists('task_reminders');
        Schema::dropIfExists('task_timers');
        Schema::dropIfExists('task_comments');
        Schema::dropIfExists('checklist_templates');
        Schema::dropIfExists('task_checklist_items');
        Schema::dropIfExists('task_followers');
        Schema::dropIfExists('task_assignees');
        Schema::dropIfExists('tasks');
    }
};
