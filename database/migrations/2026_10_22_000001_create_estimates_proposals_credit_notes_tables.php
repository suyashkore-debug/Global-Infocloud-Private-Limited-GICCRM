<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Estimates, proposals and credit notes (Perfex tblestimates, tblproposals, tblcreditnotes,
     * tblcredits, tblcreditnote_refunds). Their lines live in sales_items like invoices.
     */
    public function up(): void
    {
        $money = function (Blueprint $table) {
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('total_tax', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->decimal('adjustment', 15, 2)->default(0);
            $table->decimal('discount_percent', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->string('discount_type', 30)->nullable();
            $table->unsignedTinyInteger('show_quantity_as')->default(1);
        };
        $addresses = function (Blueprint $table) {
            foreach (['billing', 'shipping'] as $prefix) {
                $table->string("{$prefix}_street", 200)->nullable();
                $table->string("{$prefix}_city", 100)->nullable();
                $table->string("{$prefix}_state", 100)->nullable();
                $table->string("{$prefix}_zip", 100)->nullable();
                $table->string("{$prefix}_country", 100)->nullable();
            }
            $table->boolean('include_shipping')->default(false);
            $table->boolean('show_shipping')->default(true);
        };

        Schema::create('estimates', function (Blueprint $table) use ($money, $addresses) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('number');
            $table->string('prefix', 50)->nullable();
            $table->unsignedTinyInteger('number_format')->default(1);
            $table->date('date');
            $table->date('expiry_date')->nullable();
            $table->unsignedTinyInteger('status')->default(1);
            $money($table);
            $table->text('client_note')->nullable();
            $table->text('admin_note')->nullable();
            $table->text('terms')->nullable();
            $table->string('reference_no', 100)->nullable();
            $table->unsignedBigInteger('sale_agent_id')->nullable();
            $addresses($table);
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('invoiced_at')->nullable();
            $table->boolean('sent')->default(false);
            $table->dateTime('sent_at')->nullable();
            $table->unsignedInteger('pipeline_order')->default(0);
            $table->string('hash', 32)->unique();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'status']);
        });

        Schema::create('proposals', function (Blueprint $table) use ($money) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('subject', 500);
            $table->longText('content')->nullable();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            // "To" details (Perfex proposal_to + address) printed on the proposal.
            $table->string('proposal_to', 600)->nullable();
            $table->string('address', 200)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 100)->nullable();
            $table->string('zip', 50)->nullable();
            $table->string('country', 100)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('phone', 50)->nullable();
            $table->date('date');
            $table->date('open_till')->nullable();
            $table->unsignedTinyInteger('status')->default(6);
            $money($table);
            $table->unsignedBigInteger('assigned_id')->nullable();
            $table->boolean('allow_comments')->default(true);
            $table->foreignId('estimate_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('converted_at')->nullable();
            $table->unsignedInteger('pipeline_order')->default(0);
            $table->string('hash', 32)->unique();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'status']);
        });

        Schema::create('credit_notes', function (Blueprint $table) use ($money, $addresses) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('number');
            $table->string('prefix', 50)->nullable();
            $table->unsignedTinyInteger('number_format')->default(1);
            $table->date('date');
            $table->unsignedTinyInteger('status')->default(1);
            $money($table);
            $table->text('client_note')->nullable();
            $table->text('admin_note')->nullable();
            $table->text('terms')->nullable();
            $table->string('reference_no', 100)->nullable();
            $addresses($table);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'status']);
        });

        // Credit applied from a credit note to an invoice; counts like a payment on the invoice.
        Schema::create('applied_credits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('credit_note_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->date('date');
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('credit_note_refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('credit_note_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->date('refunded_on');
            $table->foreignId('payment_mode_id')->nullable()->constrained()->nullOnDelete();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_note_refunds');
        Schema::dropIfExists('applied_credits');
        Schema::dropIfExists('credit_notes');
        Schema::dropIfExists('proposals');
        Schema::dropIfExists('estimates');
    }
};
