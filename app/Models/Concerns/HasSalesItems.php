<?php

namespace App\Models\Concerns;

use App\Models\SalesItem;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Line items of a sales document (invoice, estimate, proposal, credit note).
 */
trait HasSalesItems
{
    public static function bootHasSalesItems(): void
    {
        static::deleting(function ($document) {
            $document->items()->get()->each->delete();
        });
    }

    /**
     * @return MorphMany<SalesItem, $this>
     */
    public function items(): MorphMany
    {
        return $this->morphMany(SalesItem::class, 'documentable')->orderBy('item_order')->orderBy('id');
    }
}
