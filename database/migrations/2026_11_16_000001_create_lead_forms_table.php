<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex "Web to Lead" forms: public forms (link or embed) whose submissions become leads.
     */
    public function up(): void
    {
        Schema::create('lead_forms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('form_key', 32)->unique();
            $table->string('name', 191);
            // [{type, name, label, required, placeholder, options}]; name is a lead field, cf_<id>, or extra.
            $table->json('fields');
            $table->foreignId('lead_status_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('lead_source_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('responsible_id')->nullable();
            $table->string('lead_name_prefix', 100)->nullable();
            $table->string('language', 40)->nullable();
            $table->string('submit_btn_name', 100)->default('Submit');
            $table->string('submit_btn_bg_color', 20)->default('#0b2c56');
            $table->string('submit_btn_text_color', 20)->default('#ffffff');
            // message: show success_submit_msg; redirect: go to submit_redirect_url.
            $table->string('submit_action', 20)->default('message');
            $table->text('success_submit_msg')->nullable();
            $table->string('submit_redirect_url', 500)->nullable();
            $table->boolean('mark_public')->default(false);
            $table->boolean('allow_duplicate')->default(true);
            $table->string('track_duplicate_field', 30)->nullable();
            $table->string('track_duplicate_field_and', 30)->nullable();
            $table->boolean('create_task_on_duplicate')->default(false);
            $table->boolean('notify_lead_imported')->default(true);
            // specific_staff, roles or assigned (the responsible person).
            $table->string('notify_type', 30)->nullable();
            $table->json('notify_ids')->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->foreignId('lead_form_id')->nullable()->after('lead_source_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lead_form_id');
        });
        Schema::dropIfExists('lead_forms');
    }
};
