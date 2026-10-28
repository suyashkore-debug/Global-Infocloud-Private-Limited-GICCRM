<?php

namespace App\Http\Resources;

use App\Models\Estimate;
use Illuminate\Http\Request;

/**
 * @mixin Estimate
 */
class EstimateResource extends SalesDocumentResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...$this->common($request),
            ...$this->addresses(),
            'expiry_date' => $this->expiry_date?->toDateString(),
            'reference_no' => $this->reference_no,
            'client_note' => $this->client_note,
            'admin_note' => $this->admin_note,
            'terms' => $this->terms,
            'sent' => $this->sent,
            'sent_at' => $this->sent_at,
            'invoiced_at' => $this->invoiced_at,
            'invoice' => $this->whenLoaded('invoice', fn () => $this->invoice ? ['id' => $this->invoice->id, 'formatted_number' => $this->invoice->formattedNumber()] : null),
            'sale_agent' => $this->whenLoaded('saleAgent', fn () => $this->saleAgent ? new StaffResource($this->saleAgent) : null),
        ];
    }
}
