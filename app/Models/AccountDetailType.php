<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class AccountDetailType extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'account_type_id', 'name', 'note', 'system_id'];
}
