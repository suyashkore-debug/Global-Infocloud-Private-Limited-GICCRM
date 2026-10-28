<?php

namespace App\Http\Resources;

use App\Models\SalesItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin SalesItem
 */
class SalesItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'description' => $this->description,
            'long_description' => $this->long_description,
            'hsn_code' => $this->hsn_code,
            'qty' => $this->qty,
            'rate' => $this->rate,
            'unit' => $this->unit,
            'taxes' => $this->taxes->map(fn ($t) => ['tax_name' => $t->tax_name, 'tax_rate' => $t->tax_rate]),
        ];
    }
}
