<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex Purchase module as GIC uses it: vendors (with contacts and categories), purchase
     * requests with approval, purchase orders, purchase invoices (vendor bills) and their payments.
     */
    public function up(): void
    {
        Schema::create('vendor_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('vendors', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('vendor_code', 100)->nullable();
            $table->string('name', 200);
            $table->string('vat', 200)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email', 191)->nullable();
            $table->string('website', 150)->nullable();
            $table->text('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 100)->nullable();
            $table->string('zip', 20)->nullable();
            $table->string('country', 100)->nullable();
            foreach (['billing', 'shipping'] as $p) {
                $table->string("{$p}_street", 200)->nullable();
                $table->string("{$p}_city", 100)->nullable();
                $table->string("{$p}_state", 100)->nullable();
                $table->string("{$p}_zip", 20)->nullable();
                $table->string("{$p}_country", 100)->nullable();
            }
            $table->json('category_ids')->nullable();
            $table->text('bank_detail')->nullable();
            $table->text('payment_terms')->nullable();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('balance', 15, 2)->nullable();
            $table->date('balance_as_of')->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('vendor_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->string('first_name', 191);
            $table->string('last_name', 191)->nullable();
            $table->string('email', 191)->nullable();
            $table->string('phone', 100)->nullable();
            $table->string('title', 100)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('purchase_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedInteger('number');
            $table->string('code', 45);
            $table->string('name', 191);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('requester_id');
            $table->string('department', 191)->nullable();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('request_date');
            // 1 draft, 2 approved, 3 rejected, 4 cancelled (Perfex purchase statuses)
            $table->unsignedTinyInteger('status')->default(1);
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('total_tax', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->string('hash', 32);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedInteger('number');
            $table->string('code', 45);
            $table->string('name', 191);
            $table->foreignId('vendor_id')->constrained()->restrictOnDelete();
            $table->foreignId('purchase_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->date('order_date');
            $table->date('delivery_date')->nullable();
            $table->unsignedTinyInteger('status')->default(1);
            // 0 undelivered, 1 completely delivered, 2 partially delivered
            $table->unsignedTinyInteger('delivery_status')->default(0);
            $table->unsignedBigInteger('buyer_id')->nullable();
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->string('discount_type', 10)->nullable();
            $table->decimal('discount_percent', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->decimal('total_tax', 15, 2)->default(0);
            $table->decimal('shipping_fee', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->text('vendor_note')->nullable();
            $table->text('terms')->nullable();
            $table->string('hash', 32);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('purchase_invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedInteger('number');
            $table->string('invoice_number', 100);
            $table->string('vendor_invoice_number', 191)->nullable();
            $table->foreignId('vendor_id')->constrained()->restrictOnDelete();
            $table->foreignId('purchase_order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('currency_id')->nullable()->constrained()->nullOnDelete();
            $table->date('invoice_date');
            $table->date('due_date')->nullable();
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->string('discount_type', 10)->nullable();
            $table->decimal('discount_percent', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->decimal('total_tax', 15, 2)->default(0);
            $table->decimal('shipping_fee', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            // unpaid, partially_paid, paid
            $table->string('payment_status', 20)->default('unpaid');
            $table->string('transaction_id', 191)->nullable();
            $table->text('vendor_note')->nullable();
            $table->text('admin_note')->nullable();
            $table->text('terms')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        // Lines of requests, orders and invoices.
        Schema::create('purchase_items', function (Blueprint $table) {
            $table->id();
            $table->morphs('purchasable');
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description', 500);
            $table->text('long_description')->nullable();
            $table->string('unit', 40)->nullable();
            $table->decimal('qty', 15, 2);
            $table->decimal('unit_price', 15, 2);
            $table->string('tax_name', 100)->nullable();
            $table->decimal('tax_rate', 8, 2)->default(0);
            $table->decimal('tax_value', 15, 2)->default(0);
            $table->decimal('total', 15, 2);
            $table->unsignedInteger('item_order')->default(0);
        });

        Schema::create('purchase_invoice_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_invoice_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->foreignId('payment_mode_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date');
            $table->string('transaction_id', 191)->nullable();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        // Approval workflow: who approves what, and each approver's decision on a document.
        Schema::create('purchase_approval_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 191);
            // pur_request, pur_order
            $table->string('related', 30);
            $table->json('approver_ids');
            $table->timestamps();
        });

        Schema::create('purchase_approvals', function (Blueprint $table) {
            $table->id();
            $table->morphs('approvable');
            $table->unsignedBigInteger('staff_id');
            // null pending, 2 approved, 3 rejected
            $table->unsignedTinyInteger('decision')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->unsignedBigInteger('sender_id');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['purchase_approvals', 'purchase_approval_settings', 'purchase_invoice_payments', 'purchase_items', 'purchase_invoices', 'purchase_orders',
            'purchase_requests', 'vendor_contacts', 'vendors', 'vendor_categories'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
