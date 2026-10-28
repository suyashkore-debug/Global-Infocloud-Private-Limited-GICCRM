<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreditNoteRefund extends Model
{
    protected $fillable = ['credit_note_id', 'amount', 'refunded_on', 'payment_mode_id', 'note', 'created_by'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'refunded_on' => 'date'];
    }

    /**
     * @return BelongsTo<CreditNote, $this>
     */
    public function creditNote(): BelongsTo
    {
        return $this->belongsTo(CreditNote::class);
    }

    /**
     * @return BelongsTo<PaymentMode, $this>
     */
    public function paymentMode(): BelongsTo
    {
        return $this->belongsTo(PaymentMode::class);
    }
}
