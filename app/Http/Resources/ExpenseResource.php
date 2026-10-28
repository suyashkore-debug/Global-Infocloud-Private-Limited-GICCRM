<?php

namespace App\Http\Resources;

use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Expense
 */
class ExpenseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'amount' => $this->amount,
            'total_with_tax' => $this->relationLoaded('tax') ? $this->totalWithTax() : null,
            'date' => $this->date->toDateString(),
            'billable' => $this->billable,
            'reference_no' => $this->reference_no,
            'note' => $this->note,
            'repeat_every' => $this->repeat_every,
            'recurring_type' => $this->recurring_type,
            'cycles' => $this->cycles,
            'total_cycles' => $this->total_cycles,
            'create_invoice_billable' => $this->create_invoice_billable,
            'category' => $this->whenLoaded('category', fn () => $this->category?->only(['id', 'name'])),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->only(['id', 'name'])),
            'project' => $this->whenLoaded('project', fn () => $this->project?->only(['id', 'name'])),
            'currency' => $this->whenLoaded('currency', fn () => $this->currency?->only(['id', 'name', 'symbol', 'placement'])),
            'tax' => $this->whenLoaded('tax', fn () => $this->tax?->only(['id', 'name', 'rate'])),
            'tax2' => $this->whenLoaded('tax2', fn () => $this->tax2?->only(['id', 'name', 'rate'])),
            'payment_mode' => $this->whenLoaded('paymentMode', fn () => $this->paymentMode?->only(['id', 'name'])),
            'invoice' => $this->whenLoaded('invoice', fn () => $this->invoice ? ['id' => $this->invoice->id, 'formatted_number' => $this->invoice->formattedNumber(), 'status' => $this->invoice->status->value] : null),
            'attachments' => $this->whenLoaded('attachments', fn () => AttachmentResource::collection($this->attachments)),
            'created_at' => $this->created_at,
            'can' => [
                'update' => $request->user()->can('update', $this->resource),
                'delete' => $request->user()->can('delete', $this->resource),
            ],
        ];
    }
}
