<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class PredefinedReply extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'message'];
}
