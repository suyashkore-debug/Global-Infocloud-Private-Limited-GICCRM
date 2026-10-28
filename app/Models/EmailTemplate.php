<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class EmailTemplate extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'type', 'slug', 'name', 'subject', 'message', 'from_name', 'plaintext', 'active'];

    protected function casts(): array
    {
        return ['plaintext' => 'boolean', 'active' => 'boolean'];
    }
}
