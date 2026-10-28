<?php

namespace App\Http\Resources;

use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Invoice
 */
class InvoiceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $paid = $this->payments_sum_amount ?? ($this->relationLoaded('payments') ? $this->amountPaid() : null);
        $credited = (float) ($this->applied_credits_sum_amount ?? ($this->relationLoaded('appliedCredits') ? $this->amountCredited() : 0));
        $user = $request->user();

        return [
            'id' => $this->id,
            'number' => $this->number,
            'formatted_number' => $this->formattedNumber(),
            'status' => $this->status->value,
            'date' => $this->date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'subtotal' => $this->subtotal,
            'total_tax' => $this->total_tax,
            'total' => $this->total,
            'adjustment' => $this->adjustment,
            'discount_percent' => $this->discount_percent,
            'discount_total' => $this->discount_total,
            'discount_type' => $this->discount_type,
            'amount_paid' => $paid !== null ? round((float) $paid, 2) : null,
            'credits_applied' => round($credited, 2),
            'amount_due' => $paid !== null ? round((float) $this->total - (float) $paid - $credited, 2) : null,
            'applied_credits' => $this->whenLoaded('appliedCredits', fn () => $this->appliedCredits->map(fn ($c) => [
                'id' => $c->id,
                'amount' => $c->amount,
                'date' => $c->date->toDateString(),
                'credit_note' => $c->creditNote ? ['id' => $c->creditNote->id, 'formatted_number' => $c->creditNote->formattedNumber()] : null,
            ])),
            'show_quantity_as' => $this->show_quantity_as,
            'client_note' => $this->client_note,
            'admin_note' => $this->admin_note,
            'terms' => $this->terms,
            'billing' => $this->address('billing'),
            'shipping' => $this->address('shipping'),
            'include_shipping' => $this->include_shipping,
            'show_shipping_on_invoice' => $this->show_shipping_on_invoice,
            'allowed_payment_modes' => $this->allowed_payment_modes ?? [],
            'sent' => $this->sent,
            'sent_at' => $this->sent_at,
            'cancel_overdue_reminders' => $this->cancel_overdue_reminders,
            'repeat_every' => $this->repeat_every,
            'recurring_type' => $this->recurring_type,
            'cycles' => $this->cycles,
            'total_cycles' => $this->total_cycles,
            'hash' => $this->hash,
            'customer' => $this->whenLoaded('customer', fn () => [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'vat' => $this->customer->vat,
                'company_pan' => $this->customer->company_pan,
            ]),
            'project' => $this->whenLoaded('project', fn () => $this->project ? ['id' => $this->project->id, 'name' => $this->project->name] : null),
            'currency' => $this->whenLoaded('currency', fn () => $this->currency ? $this->currency->only(['id', 'name', 'symbol', 'placement']) : null),
            'sale_agent' => $this->whenLoaded('saleAgent', fn () => $this->saleAgent ? new StaffResource($this->saleAgent) : null),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->pluck('name')),
            'items' => $this->whenLoaded('items', fn () => SalesItemResource::collection($this->items)),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id,
                'amount' => $p->amount,
                'date' => $p->date->toDateString(),
                'payment_mode' => $p->paymentMode?->name,
                'payment_method' => $p->payment_method,
                'transaction_id' => $p->transaction_id,
                'note' => $p->note,
            ])),
            'created_at' => $this->created_at,
            'can' => [
                'update' => (bool) $user?->can('update', $this->resource),
                'delete' => (bool) $user?->can('delete', $this->resource),
                'record_payment' => (bool) $user?->can('recordPayment', $this->resource),
            ],
        ];
    }

    /**
     * @return array<string, string|null>
     */
    private function address(string $prefix): array
    {
        return [
            'street' => $this->{"{$prefix}_street"},
            'city' => $this->{"{$prefix}_city"},
            'state' => $this->{"{$prefix}_state"},
            'zip' => $this->{"{$prefix}_zip"},
            'country' => $this->{"{$prefix}_country"},
        ];
    }
}
