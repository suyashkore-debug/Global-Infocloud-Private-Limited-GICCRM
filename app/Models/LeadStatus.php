<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class LeadStatus extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'status_order', 'color', 'is_default', 'notify_lead'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'notify_lead' => 'boolean'];
    }
}
