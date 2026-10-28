<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * WhatsApp conversation with a lead (WhatsApp Business Cloud API): messages staff send and
     * the replies that come back through the webhook.
     */
    public function up(): void
    {
        Schema::create('whatsapp_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedBigInteger('lead_id')->nullable()->index();
            // Staff member who sent it (outgoing only).
            $table->unsignedBigInteger('user_id')->nullable();
            $table->enum('direction', ['out', 'in']);
            // The lead's WhatsApp number, digits with country code (e.g. 919876543210).
            $table->string('wa_id', 32)->index();
            // WhatsApp's message id, used to match delivery / read receipts.
            $table->string('wamid', 191)->nullable()->unique();
            $table->string('type', 20)->default('text');
            $table->text('body')->nullable();
            $table->string('template', 191)->nullable();
            // Outgoing: pending, sent, delivered, read, failed. Incoming: received.
            $table->string('status', 20)->default('pending');
            $table->text('error')->nullable();
            // Incoming: when staff first opened it.
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_messages');
    }
};
