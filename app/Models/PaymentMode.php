<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class PaymentMode extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'description', 'show_on_pdf', 'invoices_only', 'expenses_only', 'selected_by_default', 'active'];

    protected function casts(): array
    {
        return [
            'show_on_pdf' => 'boolean',
            'invoices_only' => 'boolean',
            'expenses_only' => 'boolean',
            'selected_by_default' => 'boolean',
            'active' => 'boolean',
        ];
    }
}
