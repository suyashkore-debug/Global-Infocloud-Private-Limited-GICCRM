<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Fields every sales document shares (money, addresses, lines, customer, currency).
 */
abstract class SalesDocumentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    protected function common(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $this->id,
            'formatted_number' => $this->formattedNumber(),
            'status' => $this->status->value,
            'date' => $this->date?->toDateString(),
            'subtotal' => $this->subtotal,
            'total_tax' => $this->total_tax,
            'total' => $this->total,
            'adjustment' => $this->adjustment,
            'discount_percent' => $this->discount_percent,
            'discount_total' => $this->discount_total,
            'discount_type' => $this->discount_type,
            'show_quantity_as' => $this->show_quantity_as,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer ? $this->customer->only(['id', 'name', 'vat', 'company_pan']) : null),
            'project' => $this->whenLoaded('project', fn () => $this->project ? ['id' => $this->project->id, 'name' => $this->project->name] : null),
            'currency' => $this->whenLoaded('currency', fn () => $this->currency ? $this->currency->only(['id', 'name', 'symbol', 'placement']) : null),
            'items' => $this->whenLoaded('items', fn () => SalesItemResource::collection($this->items)),
            'tags' => $this->when(method_exists($this->resource, 'tags') && $this->resource->relationLoaded('tags'), fn () => $this->tags->pluck('name')),
            'created_at' => $this->created_at,
            'can' => [
                'update' => (bool) $user?->can('update', $this->resource),
                'delete' => (bool) $user?->can('delete', $this->resource),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function addresses(): array
    {
        $address = fn (string $p) => [
            'street' => $this->{"{$p}_street"},
            'city' => $this->{"{$p}_city"},
            'state' => $this->{"{$p}_state"},
            'zip' => $this->{"{$p}_zip"},
            'country' => $this->{"{$p}_country"},
        ];

        return [
            'billing' => $address('billing'),
            'shipping' => $address('shipping'),
            'include_shipping' => $this->include_shipping,
            'show_shipping' => $this->show_shipping,
        ];
    }
}
