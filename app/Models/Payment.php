<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A payment recorded against an invoice (Perfex tblinvoicepaymentrecords).
 */
class Payment extends Model
{
    use BelongsToCompany, BelongsToWorkspace;

    protected $fillable = ['company_id', 'invoice_id', 'amount', 'payment_mode_id', 'payment_method', 'date', 'transaction_id', 'note', 'created_by'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'date' => 'date'];
    }

    /**
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /**
     * @return BelongsTo<PaymentMode, $this>
     */
    public function paymentMode(): BelongsTo
    {
        return $this->belongsTo(PaymentMode::class);
    }

    /** The record a new one takes its workspace from (BelongsToWorkspace). */
    public function workspaceParents(): array
    {
        return ['invoice_id' => Invoice::class];
    }
}
