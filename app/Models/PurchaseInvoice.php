<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\PurchaseDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A vendor bill (Perfex purchase invoice).
 */
class PurchaseInvoice extends Model
{
    use BelongsToCompany, PurchaseDocument;

    protected $fillable = [
        'company_id', 'number', 'invoice_number', 'vendor_invoice_number', 'vendor_id', 'purchase_order_id', 'currency_id', 'invoice_date', 'due_date',
        'subtotal', 'discount_type', 'discount_percent', 'discount_total', 'total_tax', 'shipping_fee', 'total', 'payment_status',
        'transaction_id', 'vendor_note', 'admin_note', 'terms', 'created_by',
    ];

    protected function casts(): array
    {
        return ['invoice_date' => 'date', 'due_date' => 'date'];
    }

    /**
     * @return BelongsTo<Vendor, $this>
     */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    /**
     * @return BelongsTo<PurchaseOrder, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    /**
     * @return HasMany<PurchaseInvoicePayment, $this>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(PurchaseInvoicePayment::class)->orderBy('date');
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }

    public function amountPaid(): float
    {
        return round((float) $this->payments()->sum('amount'), 2);
    }

    public function amountDue(): float
    {
        return round((float) $this->total - $this->amountPaid(), 2);
    }
}
