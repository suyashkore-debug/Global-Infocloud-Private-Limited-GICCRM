<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\SharedAcrossWorkspaces;
use Illuminate\Database\Eloquent\Model;

class Tax extends Model
{
    use BelongsToCompany, SharedAcrossWorkspaces;

    protected $fillable = ['company_id', 'name', 'rate'];

    protected function casts(): array
    {
        return ['rate' => 'decimal:2'];
    }
}
