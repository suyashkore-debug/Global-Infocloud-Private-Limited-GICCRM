<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\SharedAcrossWorkspaces;
use Illuminate\Database\Eloquent\Model;

class EstimateRequestStatus extends Model
{
    use BelongsToCompany, SharedAcrossWorkspaces;

    protected $fillable = ['company_id', 'name', 'status_order', 'color', 'flag'];
}
