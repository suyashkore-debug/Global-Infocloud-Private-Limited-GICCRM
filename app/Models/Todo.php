<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class Todo extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'user_id', 'description', 'finished', 'finished_at', 'item_order'];

    protected function casts(): array
    {
        return ['finished' => 'boolean', 'finished_at' => 'datetime'];
    }
}
