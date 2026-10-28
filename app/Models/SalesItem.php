<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A line of an invoice, estimate, proposal or credit note (Perfex tblitemable).
 */
class SalesItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['description', 'long_description', 'hsn_code', 'qty', 'rate', 'unit', 'item_order'];

    protected function casts(): array
    {
        return ['qty' => 'decimal:2', 'rate' => 'decimal:2'];
    }

    /**
     * @return HasMany<SalesItemTax, $this>
     */
    public function taxes(): HasMany
    {
        return $this->hasMany(SalesItemTax::class);
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function documentable(): MorphTo
    {
        return $this->morphTo();
    }
}
