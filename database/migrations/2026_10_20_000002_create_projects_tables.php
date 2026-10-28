<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('name', 191);
            $table->text('description')->nullable();
            $table->unsignedTinyInteger('status')->default(1);
            $table->unsignedTinyInteger('billing_type')->default(1);
            $table->decimal('project_cost', 15, 2)->nullable();
            $table->decimal('project_rate_per_hour', 15, 2)->nullable();
            $table->decimal('estimated_hours', 15, 2)->nullable();
            $table->date('start_date');
            $table->date('deadline')->nullable();
            $table->dateTime('date_finished')->nullable();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->boolean('progress_from_tasks')->default(true);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'status']);
        });

        Schema::create('project_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->index();
            $table->timestamps();
            $table->unique(['project_id', 'user_id']);
        });

        Schema::create('project_pins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
            $table->unique(['project_id', 'user_id']);
        });

        // Each staff member keeps one private note per project.
        Schema::create('project_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->text('content')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'user_id']);
        });

        Schema::create('project_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('description_key', 100);
            $table->text('additional_data')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'created_at']);
        });

        Schema::create('milestones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name', 400);
            $table->text('description')->nullable();
            $table->date('start_date')->nullable();
            $table->date('due_date');
            $table->string('color', 10)->nullable();
            $table->unsignedInteger('milestone_order')->default(0);
            $table->timestamps();
        });

        Schema::create('discussions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('subject', 500);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->timestamp('last_activity_at')->nullable();
            $table->timestamps();
        });

        Schema::create('discussion_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('discussion_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('discussion_comments')->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->text('content')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discussion_comments');
        Schema::dropIfExists('discussions');
        Schema::dropIfExists('milestones');
        Schema::dropIfExists('project_activities');
        Schema::dropIfExists('project_notes');
        Schema::dropIfExists('project_pins');
        Schema::dropIfExists('project_members');
        Schema::dropIfExists('projects');
    }
};
