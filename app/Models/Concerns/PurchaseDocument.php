<?php

namespace App\Models\Concerns;

use App\Models\Currency;
use App\Models\PurchaseApproval;
use App\Models\PurchaseItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Lines, approvals and currency shared by purchase requests, orders and invoices.
 */
trait PurchaseDocument
{
    /**
     * @return MorphMany<PurchaseItem, $this>
     */
    public function items(): MorphMany
    {
        return $this->morphMany(PurchaseItem::class, 'purchasable')->orderBy('item_order')->orderBy('id');
    }

    /**
     * @return MorphMany<PurchaseApproval, $this>
     */
    public function approvals(): MorphMany
    {
        return $this->morphMany(PurchaseApproval::class, 'approvable')->orderBy('id');
    }

    /**
     * @return BelongsTo<Currency, $this>
     */
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
