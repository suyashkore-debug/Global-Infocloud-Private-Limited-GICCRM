<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Perfex profile fields HRMS doesn't keep (social links, e-mail signature). Name, phone,
     * photo and password stay in HRMS.
     */
    public function up(): void
    {
        Schema::create('staff_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedBigInteger('user_id')->unique();
            $table->string('facebook')->nullable();
            $table->string('linkedin')->nullable();
            $table->string('skype')->nullable();
            $table->text('email_signature')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_profiles');
    }
};
