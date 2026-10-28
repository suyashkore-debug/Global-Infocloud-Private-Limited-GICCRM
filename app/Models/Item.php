<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved product / service (Perfex Sales → Items) picked into sales documents.
 */
class Item extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'item_group_id', 'description', 'long_description', 'hsn_code', 'rate', 'tax_id', 'tax2_id', 'unit'];

    protected function casts(): array
    {
        return ['rate' => 'decimal:2'];
    }

    /**
     * @return BelongsTo<ItemGroup, $this>
     */
    public function group(): BelongsTo
    {
        return $this->belongsTo(ItemGroup::class, 'item_group_id');
    }

    /**
     * @return BelongsTo<Tax, $this>
     */
    public function tax(): BelongsTo
    {
        return $this->belongsTo(Tax::class);
    }

    /**
     * @return BelongsTo<Tax, $this>
     */
    public function tax2(): BelongsTo
    {
        return $this->belongsTo(Tax::class, 'tax2_id');
    }
}
