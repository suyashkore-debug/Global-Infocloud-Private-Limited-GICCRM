<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfex "Templates": ready-made formatted content to insert into proposals and contracts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('type', 20);
            $table->string('name');
            $table->longText('content')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->index(['company_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('templates');
    }
};
