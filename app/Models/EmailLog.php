<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class EmailLog extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'template', 'to', 'cc', 'subject', 'rel_type', 'rel_id', 'status', 'error', 'user_id'];
}
