<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

/**
 * A saved checklist item that can be added to any task.
 */
class ChecklistTemplate extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'description'];
}
