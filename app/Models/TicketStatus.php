<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class TicketStatus extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'color', 'status_order', 'system_key'];
}
