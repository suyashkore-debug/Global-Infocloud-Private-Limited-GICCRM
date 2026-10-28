<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfex saved filters: a list's filters saved under a name (private or shared with the team),
 * and each user's default filter per list.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saved_filters', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->unsignedBigInteger('user_id');
            $table->string('identifier', 50);
            $table->string('name', 191);
            $table->json('filters');
            $table->boolean('is_shared')->default(false);
            $table->timestamps();
            $table->index(['company_id', 'identifier']);
        });

        Schema::create('saved_filter_defaults', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('identifier', 50);
            $table->foreignId('saved_filter_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'identifier']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_filter_defaults');
        Schema::dropIfExists('saved_filters');
    }
};
