<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['purchasable_type', 'purchasable_id', 'item_id', 'description', 'long_description', 'unit', 'qty', 'unit_price', 'tax_name', 'tax_rate', 'tax_value', 'total', 'item_order'];
}
