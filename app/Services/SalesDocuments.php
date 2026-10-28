<?php

namespace App\Services;

use App\Models\Currency;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Model;

/**
 * Helpers shared by invoices, estimates, credit notes and proposals.
 */
class SalesDocuments
{
    /**
     * Fill what the Perfex form fills from the customer: currency and billing / shipping address.
     *
     * @param  array<string, mixed>  $fields
     * @return array<string, mixed>
     */
    public static function withCustomerDefaults(array $fields, Customer $customer): array
    {
        $fields['currency_id'] ??= $customer->default_currency_id ?? Currency::default()->id;

        foreach (['street', 'city', 'state', 'zip', 'country'] as $part) {
            $fields["billing_{$part}"] ??= $customer->{"billing_{$part}"} ?? ($part === 'street' ? $customer->address : $customer->{$part});
            if (! empty($fields['include_shipping'])) {
                $fields["shipping_{$part}"] ??= $customer->{"shipping_{$part}"};
            }
        }

        return $fields;
    }

    /**
     * A document's lines in the shape SalesItemsWriter takes, for copying / converting.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function itemsOf(Model $document): array
    {
        $document->loadMissing('items.taxes');

        return $document->items->map(fn ($item) => [
            ...$item->only(['description', 'long_description', 'hsn_code', 'qty', 'rate', 'unit']),
            'taxes' => $item->taxes->map->only(['tax_name', 'tax_rate'])->all(),
        ])->all();
    }

    /**
     * The money inputs of a document (to copy its discount and adjustment).
     *
     * @return array<string, mixed>
     */
    public static function moneyOf(Model $document): array
    {
        return [
            'discount_type' => $document->discount_type,
            'discount_percent' => $document->discount_percent,
            'discount_total' => (float) $document->discount_percent > 0 ? 0 : $document->discount_total,
            'adjustment' => $document->adjustment,
            'show_quantity_as' => $document->show_quantity_as,
        ];
    }
}
