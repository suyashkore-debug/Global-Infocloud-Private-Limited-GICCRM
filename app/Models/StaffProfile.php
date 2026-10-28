<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class StaffProfile extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'user_id', 'facebook', 'linkedin', 'skype', 'email_signature'];
}
