<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Invoices and their payments, plus the line items shared by every sales document
     * (Perfex tblitemable / tblitem_tax).
     */
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('number');
            $table->string('prefix', 50)->nullable();
            $table->unsignedTinyInteger('number_format')->default(1);
            $table->date('date');
            $table->date('due_date')->nullable();
            $table->unsignedTinyInteger('status')->default(1);
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('total_tax', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->decimal('adjustment', 15, 2)->default(0);
            $table->decimal('discount_percent', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->string('discount_type', 30)->nullable();
            $table->unsignedTinyInteger('show_quantity_as')->default(1);
            $table->text('client_note')->nullable();
            $table->text('admin_note')->nullable();
            $table->text('terms')->nullable();
            $table->unsignedBigInteger('sale_agent_id')->nullable();
            foreach (['billing', 'shipping'] as $prefix) {
                $table->string("{$prefix}_street", 200)->nullable();
                $table->string("{$prefix}_city", 100)->nullable();
                $table->string("{$prefix}_state", 100)->nullable();
                $table->string("{$prefix}_zip", 100)->nullable();
                $table->string("{$prefix}_country", 100)->nullable();
            }
            $table->boolean('include_shipping')->default(false);
            $table->boolean('show_shipping_on_invoice')->default(true);
            $table->json('allowed_payment_modes')->nullable();
            $table->boolean('sent')->default(false);
            $table->dateTime('sent_at')->nullable();
            $table->boolean('cancel_overdue_reminders')->default(false);
            $table->string('hash', 32)->unique();
            $table->unsignedInteger('repeat_every')->nullable();
            $table->string('recurring_type', 10)->nullable();
            $table->unsignedInteger('cycles')->default(0);
            $table->unsignedInteger('total_cycles')->default(0);
            $table->date('last_recurring_date')->nullable();
            $table->foreignId('recurring_from_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'status']);
        });

        // Lines of any sales document (invoice, estimate, proposal, credit note).
        Schema::create('sales_items', function (Blueprint $table) {
            $table->id();
            $table->morphs('documentable');
            $table->string('description', 500);
            $table->text('long_description')->nullable();
            $table->string('hsn_code', 50)->nullable();
            $table->decimal('qty', 15, 2)->default(1);
            $table->decimal('rate', 15, 2)->default(0);
            $table->string('unit', 40)->nullable();
            $table->unsignedInteger('item_order')->default(0);
        });

        // Taxes are copied onto the line (name + rate) so later tax changes never alter old documents.
        Schema::create('sales_item_taxes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_item_id')->constrained()->cascadeOnDelete();
            $table->string('tax_name', 100);
            $table->decimal('tax_rate', 15, 2);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->foreignId('payment_mode_id')->nullable()->constrained()->nullOnDelete();
            $table->string('payment_method', 200)->nullable();
            $table->date('date');
            $table->string('transaction_id', 191)->nullable();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('sales_item_taxes');
        Schema::dropIfExists('sales_items');
        Schema::dropIfExists('invoices');
    }
};
