<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staff chat (GICHRMS "Perfex CRM Powerful Chat"): one-to-one messages, group chats with
 * their members, shared files (rows in `files`) and each user's chat status.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('name');
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });

        Schema::create('chat_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_group_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->index();
            $table->unsignedBigInteger('last_read_message_id')->nullable();
            $table->timestamps();
            $table->unique(['chat_group_id', 'user_id']);
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->unsignedBigInteger('sender_id');
            $table->unsignedBigInteger('receiver_id')->nullable();
            $table->foreignId('chat_group_id')->nullable()->constrained()->cascadeOnDelete();
            $table->text('message')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['company_id', 'sender_id', 'receiver_id']);
            $table->index(['receiver_id', 'read_at']);
            $table->index(['chat_group_id', 'id']);
        });

        Schema::create('chat_presences', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->primary();
            $table->string('status', 20)->default('online');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_presences');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_group_members');
        Schema::dropIfExists('chat_groups');
    }
};
