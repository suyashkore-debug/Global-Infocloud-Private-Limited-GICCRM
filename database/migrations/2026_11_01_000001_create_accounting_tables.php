<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex accounting module core: chart of accounts (Perfex account types and detail types),
     * journal entries, transfers between accounts, and the ledger every posting writes to.
     */
    public function up(): void
    {
        Schema::create('account_detail_types', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedTinyInteger('account_type_id');
            $table->string('name');
            $table->text('note')->nullable();
            // The Perfex id of a built-in detail type (null for the company's own).
            $table->unsignedInteger('system_id')->nullable();
            $table->timestamps();
        });

        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            // Perfex key of a built-in account (acc_opening_balance_equity, ...).
            $table->string('key_name', 120)->nullable();
            $table->string('number', 45)->nullable();
            $table->string('name');
            $table->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->unsignedTinyInteger('account_type_id');
            $table->foreignId('account_detail_type_id')->nullable()->constrained()->nullOnDelete();
            $table->text('description')->nullable();
            $table->decimal('balance', 15, 2)->nullable();
            $table->date('balance_as_of')->nullable();
            $table->boolean('active')->default(true);
            $table->string('bank_account', 191)->nullable();
            $table->string('bank_name', 191)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['company_id', 'key_name']);
        });

        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedInteger('number');
            $table->date('journal_date');
            $table->string('reference', 100)->nullable();
            $table->text('description')->nullable();
            $table->decimal('amount', 15, 2)->default(0);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('account_transfers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->foreignId('from_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('to_account_id')->constrained('accounts')->restrictOnDelete();
            $table->decimal('amount', 15, 2);
            $table->date('date');
            $table->text('description')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        // The ledger (Perfex acc_account_history): every debit / credit posted to an account.
        Schema::create('account_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->date('date');
            $table->decimal('debit', 15, 2)->default(0);
            $table->decimal('credit', 15, 2)->default(0);
            $table->string('description', 1000)->nullable();
            // journal_entry, transfer, opening_balance
            $table->string('rel_type', 40);
            $table->unsignedBigInteger('rel_id')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['company_id', 'account_id', 'date']);
            $table->index(['rel_type', 'rel_id']);
        });
    }

    public function down(): void
    {
        foreach (['account_transactions', 'account_transfers', 'journal_entries', 'accounts', 'account_detail_types'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
