<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex estimate requests: public web forms, the requests they collect and request statuses.
     */
    public function up(): void
    {
        Schema::create('estimate_request_statuses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 50);
            $table->unsignedInteger('status_order')->default(0);
            $table->string('color', 10)->default('#28B8DA');
            // cancelled / processing / completed: system statuses that can't be deleted.
            $table->string('flag', 30)->nullable();
            $table->timestamps();
        });

        Schema::create('estimate_request_forms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('form_key', 32)->unique();
            $table->string('name', 191);
            // [{type, name, label, required, placeholder, options: [..]}]
            $table->json('fields');
            $table->foreignId('estimate_request_status_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('responsible_id')->nullable();
            $table->string('submit_btn_name', 100)->default('Submit');
            $table->text('success_submit_msg')->nullable();
            $table->boolean('notify_request_submitted')->default(false);
            $table->string('notify_type', 30)->nullable();
            $table->json('notify_ids')->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('estimate_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('email', 191);
            // [{label, name, value}] as submitted
            $table->json('submission');
            $table->foreignId('estimate_request_form_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('estimate_request_status_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('assigned_id')->nullable()->index();
            $table->timestamp('last_status_change_at')->nullable();
            $table->timestamp('date_estimated')->nullable();
            $table->foreignId('estimate_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('proposal_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('estimate_requests');
        Schema::dropIfExists('estimate_request_forms');
        Schema::dropIfExists('estimate_request_statuses');
    }
};
