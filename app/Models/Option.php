<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

/**
 * A company setting (Perfex tbloptions). Read and write through App\Services\Options.
 */
class Option extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'value'];
}
