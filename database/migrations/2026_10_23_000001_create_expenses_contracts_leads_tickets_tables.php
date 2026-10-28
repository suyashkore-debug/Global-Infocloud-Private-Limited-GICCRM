<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex expenses, contracts, leads and support tickets, plus notes and reminders that any
     * record (lead, customer, contract, ...) can have.
     */
    public function up(): void
    {
        // ── Expenses ─────────────────────────────────────────────────────
        Schema::create('expense_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 300);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('expense_category_id')->constrained()->restrictOnDelete();
            $table->string('name', 500)->nullable();
            $table->decimal('amount', 15, 2);
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('tax_id')->nullable()->constrained('taxes')->nullOnDelete();
            $table->foreignId('tax2_id')->nullable()->constrained('taxes')->nullOnDelete();
            $table->date('date');
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('billable')->default(false);
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payment_mode_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference_no', 100)->nullable();
            $table->text('note')->nullable();
            $table->unsignedInteger('repeat_every')->nullable();
            $table->string('recurring_type', 10)->nullable();
            $table->unsignedInteger('cycles')->default(0);
            $table->unsignedInteger('total_cycles')->default(0);
            $table->date('last_recurring_date')->nullable();
            $table->foreignId('recurring_from_id')->nullable()->constrained('expenses')->nullOnDelete();
            $table->boolean('create_invoice_billable')->default(false);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        // ── Contracts ────────────────────────────────────────────────────
        Schema::create('contract_types', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('contracts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('subject', 300);
            $table->text('description')->nullable();
            $table->longText('content')->nullable();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('contract_type_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->decimal('contract_value', 15, 2)->nullable();
            $table->boolean('trash')->default(false);
            $table->boolean('not_visible_to_client')->default(false);
            $table->boolean('signed')->default(false);
            $table->boolean('marked_as_signed')->default(false);
            $table->string('signer_name', 150)->nullable();
            $table->dateTime('signed_at')->nullable();
            $table->boolean('expiry_notified')->default(false);
            $table->string('hash', 32)->unique();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('contract_renewals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $table->date('old_start_date');
            $table->date('new_start_date');
            $table->date('old_end_date')->nullable();
            $table->date('new_end_date')->nullable();
            $table->decimal('old_value', 15, 2)->nullable();
            $table->decimal('new_value', 15, 2)->nullable();
            $table->unsignedBigInteger('renewed_by');
            $table->timestamps();
        });

        Schema::create('contract_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->text('content');
            $table->timestamps();
        });

        // ── Leads ────────────────────────────────────────────────────────
        Schema::create('lead_statuses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 50);
            $table->unsignedInteger('status_order')->default(0);
            $table->string('color', 10)->default('#28B8DA');
            // Perfex "default" status: the one a lead gets when it is converted to a customer.
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('lead_sources', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 150);
            $table->timestamps();
        });

        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 300);
            $table->string('title', 100)->nullable();
            $table->string('company', 300)->nullable();
            $table->text('description')->nullable();
            $table->string('email', 150)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('website', 150)->nullable();
            $table->string('address', 200)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 100)->nullable();
            $table->string('zip', 20)->nullable();
            $table->string('country', 100)->nullable();
            $table->foreignId('lead_status_id')->constrained()->restrictOnDelete();
            $table->foreignId('lead_source_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('assigned_id')->nullable()->index();
            $table->date('assigned_at')->nullable();
            $table->decimal('lead_value', 15, 2)->nullable();
            $table->boolean('is_public')->default(false);
            $table->boolean('lost')->default(false);
            $table->boolean('junk')->default(false);
            $table->dateTime('last_contact_at')->nullable();
            $table->dateTime('last_status_change_at')->nullable();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('converted_at')->nullable();
            $table->unsignedInteger('lead_order')->default(0);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('lead_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('description', 600);
            $table->boolean('custom')->default(false);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::table('proposals', function (Blueprint $table) {
            $table->foreignId('lead_id')->nullable()->after('customer_id')->constrained()->nullOnDelete();
        });

        // ── Notes & reminders on any record ──────────────────────────────
        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->morphs('notable');
            $table->text('description');
            $table->dateTime('contacted_at')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('reminders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->morphs('remindable');
            $table->unsignedBigInteger('user_id');
            $table->dateTime('remind_at');
            $table->text('description')->nullable();
            $table->boolean('notify_by_email')->default(false);
            $table->boolean('is_notified')->default(false);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        // ── Support ──────────────────────────────────────────────────────
        Schema::create('support_departments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 100);
            $table->string('email', 100)->nullable();
            $table->boolean('hide_from_client')->default(false);
            $table->timestamps();
        });

        Schema::create('support_department_user', function (Blueprint $table) {
            $table->foreignId('support_department_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->primary(['support_department_id', 'user_id']);
        });

        Schema::create('ticket_statuses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 50);
            $table->string('color', 10)->default('#757575');
            $table->unsignedInteger('status_order')->default(0);
            // Perfex built-in statuses (Open, In progress, Answered, On Hold, Closed) cannot be deleted.
            $table->string('system_key', 20)->nullable();
            $table->timestamps();
        });

        Schema::create('ticket_priorities', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 50);
            $table->timestamps();
        });

        Schema::create('ticket_services', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 50);
            $table->timestamps();
        });

        Schema::create('predefined_replies', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 300);
            $table->text('message');
            $table->timestamps();
        });

        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('subject', 300);
            $table->text('message');
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            // When the ticket is not from a customer contact (Perfex "name" / "email").
            $table->string('name', 191)->nullable();
            $table->string('email', 191)->nullable();
            $table->string('cc', 191)->nullable();
            $table->foreignId('support_department_id')->constrained()->restrictOnDelete();
            $table->foreignId('ticket_priority_id')->constrained()->restrictOnDelete();
            $table->foreignId('ticket_status_id')->constrained()->restrictOnDelete();
            $table->foreignId('ticket_service_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('assigned_id')->nullable()->index();
            $table->dateTime('last_reply_at')->nullable();
            $table->boolean('admin_read')->default(true);
            $table->string('ticket_key', 32)->unique();
            $table->foreignId('merged_into_id')->nullable()->constrained('tickets')->nullOnDelete();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });

        Schema::create('ticket_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 191)->nullable();
            $table->string('email', 191)->nullable();
            $table->text('message');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['ticket_replies', 'tickets', 'predefined_replies', 'ticket_services', 'ticket_priorities', 'ticket_statuses',
            'support_department_user', 'support_departments', 'reminders', 'notes'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('proposals', fn (Blueprint $table) => $table->dropConstrainedForeignId('lead_id'));
        foreach (['lead_activities', 'leads', 'lead_sources', 'lead_statuses', 'contract_comments', 'contract_renewals',
            'contracts', 'contract_types', 'expenses', 'expense_categories'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
