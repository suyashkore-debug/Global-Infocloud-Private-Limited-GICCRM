<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\SharedAcrossWorkspaces;
use Illuminate\Database\Eloquent\Model;

class CustomerGroup extends Model
{
    use BelongsToCompany, SharedAcrossWorkspaces;

    protected $fillable = ['company_id', 'name'];
}
