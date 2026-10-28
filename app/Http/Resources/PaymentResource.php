<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Payment
 */
class PaymentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'amount' => $this->amount,
            'date' => $this->date->toDateString(),
            'payment_mode' => $this->paymentMode?->only(['id', 'name']),
            'payment_method' => $this->payment_method,
            'transaction_id' => $this->transaction_id,
            'note' => $this->note,
            'invoice' => $this->whenLoaded('invoice', fn () => [
                'id' => $this->invoice->id,
                'formatted_number' => $this->invoice->formattedNumber(),
                'customer' => $this->invoice->customer?->only(['id', 'name']),
                'currency' => $this->invoice->currency?->only(['symbol', 'placement']),
            ]),
            'created_at' => $this->created_at,
        ];
    }
}
