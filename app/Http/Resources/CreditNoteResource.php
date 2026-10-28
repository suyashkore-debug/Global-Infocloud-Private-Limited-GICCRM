<?php

namespace App\Http\Resources;

use App\Models\CreditNote;
use Illuminate\Http\Request;

/**
 * @mixin CreditNote
 */
class CreditNoteResource extends SalesDocumentResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...$this->common($request),
            ...$this->addresses(),
            'reference_no' => $this->reference_no,
            'client_note' => $this->client_note,
            'admin_note' => $this->admin_note,
            'terms' => $this->terms,
            'remaining_credits' => $this->remainingCredits(),
            'applied_credits' => $this->whenLoaded('appliedCredits', fn () => $this->appliedCredits->map(fn ($c) => [
                'id' => $c->id,
                'amount' => $c->amount,
                'date' => $c->date->toDateString(),
                'invoice' => $c->invoice ? ['id' => $c->invoice->id, 'formatted_number' => $c->invoice->formattedNumber()] : null,
            ])),
            'refunds' => $this->whenLoaded('refunds', fn () => $this->refunds->map(fn ($r) => [
                'id' => $r->id,
                'amount' => $r->amount,
                'refunded_on' => $r->refunded_on->toDateString(),
                'payment_mode' => $r->paymentMode?->name,
                'note' => $r->note,
            ])),
        ];
    }
}
