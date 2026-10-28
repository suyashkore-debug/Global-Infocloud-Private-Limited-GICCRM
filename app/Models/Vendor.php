<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A supplier (Perfex purchase "vendor").
 */
class Vendor extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'vendor_code', 'name', 'vat', 'phone', 'email', 'website', 'address', 'city', 'state', 'zip', 'country',
        'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
        'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country',
        'category_ids', 'bank_detail', 'payment_terms', 'currency_id', 'balance', 'balance_as_of', 'active', 'created_by',
    ];

    protected function casts(): array
    {
        return ['category_ids' => 'array', 'active' => 'boolean', 'balance' => 'decimal:2', 'balance_as_of' => 'date'];
    }

    /**
     * @return HasMany<VendorContact, $this>
     */
    public function contacts(): HasMany
    {
        return $this->hasMany(VendorContact::class)->orderByDesc('is_primary')->orderBy('first_name');
    }

    /**
     * @return HasOne<VendorContact, $this>
     */
    public function primaryContact(): HasOne
    {
        return $this->hasOne(VendorContact::class)->where('is_primary', true);
    }

    /**
     * @return BelongsTo<Currency, $this>
     */
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    /**
     * @return HasMany<PurchaseInvoice, $this>
     */
    public function invoices(): HasMany
    {
        return $this->hasMany(PurchaseInvoice::class);
    }

    /**
     * @return HasMany<PurchaseOrder, $this>
     */
    public function orders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }
}
