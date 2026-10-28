<?php

namespace App\Services;

use App\Models\Concerns\HasSalesItems;
use Illuminate\Database\Eloquent\Model;

/**
 * Replace a document's lines and store its recalculated totals.
 */
class SalesItemsWriter
{
    /**
     * @param  Model&object{items: mixed}  $document  a model using HasSalesItems
     * @param  array<int, array<string, mixed>>  $items
     * @param  array{discount_type?: ?string, discount_percent?: float|int|string|null, discount_total?: float|int|string|null, adjustment?: float|int|string|null}  $money
     */
    public static function write(Model $document, array $items, array $money): void
    {
        /** @var Model&HasSalesItems $document */
        $document->items()->get()->each->delete();

        $normalized = [];
        foreach (array_values($items) as $order => $line) {
            $taxes = collect($line['taxes'] ?? [])->map(fn ($tax) => [
                'tax_name' => (string) $tax['tax_name'],
                'tax_rate' => (float) $tax['tax_rate'],
            ])->unique(fn ($tax) => $tax['tax_name'].'|'.$tax['tax_rate'])->values()->all();

            $item = $document->items()->create([
                'description' => $line['description'],
                'long_description' => $line['long_description'] ?? null,
                'hsn_code' => $line['hsn_code'] ?? null,
                'qty' => $line['qty'],
                'rate' => $line['rate'],
                'unit' => $line['unit'] ?? null,
                'item_order' => $order + 1,
            ]);
            $item->taxes()->createMany($taxes);

            $normalized[] = ['qty' => $line['qty'], 'rate' => $line['rate'], 'taxes' => $taxes];
        }

        $discountType = $money['discount_type'] ?? null ?: null;
        $totals = SalesCalculator::calculate(
            $normalized,
            $discountType,
            (float) ($money['discount_percent'] ?? 0),
            (float) ($money['discount_total'] ?? 0),
            (float) ($money['adjustment'] ?? 0),
        );

        $document->forceFill([
            'subtotal' => $totals['subtotal'],
            'total_tax' => $totals['total_tax'],
            'discount_total' => $totals['discount_total'],
            'discount_percent' => $discountType ? (float) ($money['discount_percent'] ?? 0) : 0,
            'discount_type' => $discountType,
            'adjustment' => (float) ($money['adjustment'] ?? 0),
            'total' => $totals['total'],
        ])->save();
    }
}
