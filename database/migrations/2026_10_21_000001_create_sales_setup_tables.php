<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex setup data used by every sales document: options (tbloptions), currencies, taxes,
     * payment modes, items and item groups. Plus Perfex's customer fields (billing / shipping,
     * GST), contacts and customer groups.
     */
    public function up(): void
    {
        Schema::create('options', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->string('name', 100);
            $table->longText('value')->nullable();
            $table->timestamps();
            $table->unique(['company_id', 'name']);
        });

        Schema::create('currencies', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 100);
            $table->string('symbol', 10);
            $table->string('decimal_separator', 5)->default('.');
            $table->string('thousand_separator', 5)->default(',');
            $table->string('placement', 10)->default('before');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('taxes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 100);
            $table->decimal('rate', 15, 2);
            $table->timestamps();
        });

        Schema::create('payment_modes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->boolean('show_on_pdf')->default(false);
            $table->boolean('invoices_only')->default(false);
            $table->boolean('expenses_only')->default(false);
            $table->boolean('selected_by_default')->default(true);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('item_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name', 100);
            $table->timestamps();
        });

        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('item_group_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description', 500);
            $table->text('long_description')->nullable();
            $table->string('hsn_code', 50)->nullable();
            $table->decimal('rate', 15, 2)->default(0);
            $table->foreignId('tax_id')->nullable()->constrained('taxes')->nullOnDelete();
            $table->foreignId('tax2_id')->nullable()->constrained('taxes')->nullOnDelete();
            $table->string('unit', 40)->nullable();
            $table->timestamps();
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('company_pan', 20)->nullable()->after('vat');
            $table->string('gst_type', 20)->nullable()->after('company_pan');
            $table->foreignId('default_currency_id')->nullable()->after('country')->constrained('currencies')->nullOnDelete();
            foreach (['billing', 'shipping'] as $prefix) {
                $table->string("{$prefix}_street", 200)->nullable();
                $table->string("{$prefix}_city", 100)->nullable();
                $table->string("{$prefix}_state", 100)->nullable();
                $table->string("{$prefix}_zip", 100)->nullable();
                $table->string("{$prefix}_country", 100)->nullable();
            }
        });

        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->string('first_name', 191);
            $table->string('last_name', 191)->nullable();
            $table->string('email', 191);
            $table->string('phone', 100)->nullable();
            $table->string('title', 200)->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('invoice_emails')->default(true);
            $table->boolean('estimate_emails')->default(true);
            $table->boolean('credit_note_emails')->default(true);
            $table->boolean('contract_emails')->default(true);
            $table->boolean('task_emails')->default(true);
            $table->boolean('project_emails')->default(true);
            $table->boolean('ticket_emails')->default(true);
            $table->timestamps();
        });

        Schema::create('customer_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('customer_customer_group', function (Blueprint $table) {
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_group_id')->constrained()->cascadeOnDelete();
            $table->primary(['customer_id', 'customer_group_id']);
        });

        // Perfex "customer admins": staff responsible for a customer.
        Schema::create('customer_admins', function (Blueprint $table) {
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->timestamps();
            $table->primary(['customer_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_admins');
        Schema::dropIfExists('customer_customer_group');
        Schema::dropIfExists('customer_groups');
        Schema::dropIfExists('contacts');
        Schema::table('customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('default_currency_id');
            $columns = ['company_pan', 'gst_type'];
            foreach (['billing', 'shipping'] as $prefix) {
                foreach (['street', 'city', 'state', 'zip', 'country'] as $field) {
                    $columns[] = "{$prefix}_{$field}";
                }
            }
            $table->dropColumn($columns);
        });
        Schema::dropIfExists('items');
        Schema::dropIfExists('item_groups');
        Schema::dropIfExists('payment_modes');
        Schema::dropIfExists('taxes');
        Schema::dropIfExists('currencies');
        Schema::dropIfExists('options');
    }
};
