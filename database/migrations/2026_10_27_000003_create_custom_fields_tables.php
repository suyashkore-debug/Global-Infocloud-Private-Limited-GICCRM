<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex custom fields: extra fields an admin adds to customers, projects, invoices, ...
     */
    public function up(): void
    {
        Schema::create('custom_fields', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            // leads, customers, contacts, contracts, tasks, expenses, invoice, credit_note, estimate, proposal, projects, tickets, items
            $table->string('field_to', 30);
            $table->string('name', 150);
            $table->string('slug', 150);
            // input, number, textarea, select, multiselect, checkbox, date_picker, date_picker_time, colorpicker, link
            $table->string('type', 20);
            $table->json('options')->nullable();
            $table->text('default_value')->nullable();
            $table->boolean('required')->default(false);
            $table->boolean('active')->default(true);
            $table->boolean('only_admin')->default(false);
            $table->boolean('show_on_table')->default(false);
            $table->boolean('show_on_pdf')->default(false);
            $table->unsignedInteger('field_order')->default(0);
            $table->unsignedTinyInteger('bs_column')->default(12);
            $table->timestamps();
            $table->index(['company_id', 'field_to']);
        });

        Schema::create('custom_field_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('custom_field_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('rel_id');
            $table->text('value')->nullable();
            $table->unique(['custom_field_id', 'rel_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_field_values');
        Schema::dropIfExists('custom_fields');
    }
};
