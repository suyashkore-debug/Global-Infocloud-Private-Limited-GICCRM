<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalesItemTax extends Model
{
    public $timestamps = false;

    protected $fillable = ['sales_item_id', 'tax_name', 'tax_rate'];

    protected function casts(): array
    {
        return ['tax_rate' => 'decimal:2'];
    }
}
