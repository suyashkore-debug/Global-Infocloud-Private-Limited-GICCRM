<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex newsfeed: staff posts (for everyone or for some departments), comments and likes.
     */
    public function up(): void
    {
        Schema::create('newsfeed_posts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedBigInteger('user_id');
            $table->text('content');
            // null = all staff; otherwise the support department ids that can see the post.
            $table->json('visibility')->nullable();
            $table->boolean('pinned')->default(false);
            $table->timestamp('pinned_at')->nullable();
            $table->timestamps();
        });

        Schema::create('newsfeed_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsfeed_post_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->text('content');
            $table->timestamps();
        });

        Schema::create('newsfeed_post_likes', function (Blueprint $table) {
            $table->foreignId('newsfeed_post_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->timestamp('created_at')->useCurrent();
            $table->primary(['newsfeed_post_id', 'user_id']);
        });

        Schema::create('newsfeed_comment_likes', function (Blueprint $table) {
            $table->foreignId('newsfeed_comment_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->timestamp('created_at')->useCurrent();
            $table->primary(['newsfeed_comment_id', 'user_id']);
        });
    }

    public function down(): void
    {
        foreach (['newsfeed_comment_likes', 'newsfeed_post_likes', 'newsfeed_comments', 'newsfeed_posts'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
