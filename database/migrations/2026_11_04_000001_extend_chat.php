<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chat with customers (portal contacts), announcements, and each user's chat look.
 * A customer conversation is the rows with contact_id; from_contact marks the customer's side.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->unsignedBigInteger('sender_id')->nullable()->change();
            $table->unsignedBigInteger('contact_id')->nullable()->after('chat_group_id')->index();
            $table->boolean('from_contact')->default(false)->after('contact_id');
            $table->boolean('is_announcement')->default(false)->after('from_contact');
        });

        Schema::table('chat_presences', function (Blueprint $table) {
            $table->string('theme', 10)->default('light')->after('status');
            $table->string('color', 7)->nullable()->after('theme');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn(['contact_id', 'from_contact', 'is_announcement']);
        });
        Schema::table('chat_presences', function (Blueprint $table) {
            $table->dropColumn(['theme', 'color']);
        });
    }
};
