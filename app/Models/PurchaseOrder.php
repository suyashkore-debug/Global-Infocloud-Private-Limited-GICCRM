<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\PurchaseDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    use BelongsToCompany, PurchaseDocument;

    protected $fillable = [
        'company_id', 'number', 'code', 'name', 'vendor_id', 'purchase_request_id', 'project_id', 'currency_id', 'order_date', 'delivery_date',
        'status', 'delivery_status', 'buyer_id', 'subtotal', 'discount_type', 'discount_percent', 'discount_total', 'total_tax', 'shipping_fee',
        'total', 'vendor_note', 'terms', 'hash', 'created_by',
    ];

    protected function casts(): array
    {
        return ['order_date' => 'date', 'delivery_date' => 'date', 'status' => 'integer', 'delivery_status' => 'integer'];
    }

    /**
     * @return BelongsTo<Vendor, $this>
     */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    /**
     * @return BelongsTo<PurchaseRequest, $this>
     */
    public function request(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function buyer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'buyer_id');
    }

    /**
     * @return HasMany<PurchaseInvoice, $this>
     */
    public function invoices(): HasMany
    {
        return $this->hasMany(PurchaseInvoice::class);
    }
}
