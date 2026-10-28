<?php

namespace App\Services;

/**
 * Totals of a sales document, computed exactly as Perfex's calculate_total(): tax per line,
 * discount (percent or fixed) before or after tax, then the adjustment.
 */
class SalesCalculator
{
    /**
     * @param  array<int, array{qty: float|int|string, rate: float|int|string, taxes?: array<int, array{tax_name: string, tax_rate: float|int|string}>}>  $items
     * @return array{subtotal: float, total_tax: float, discount_total: float, total: float, taxes: array<string, float>}
     */
    public static function calculate(array $items, ?string $discountType, float $discountPercent, float $discountFixed, float $adjustment): array
    {
        $subtotal = 0.0;
        $taxes = [];

        foreach ($items as $item) {
            $amount = round((float) $item['qty'] * (float) $item['rate'], 2);
            $subtotal += $amount;
            foreach ($item['taxes'] ?? [] as $tax) {
                if ((float) $tax['tax_rate'] == 0.0) {
                    continue;
                }
                $key = $tax['tax_name'].'|'.(float) $tax['tax_rate'];
                $taxes[$key] = ($taxes[$key] ?? 0) + $amount / 100 * (float) $tax['tax_rate'];
            }
        }

        $usePercent = $discountPercent > 0;
        $useFixed = ! $usePercent && $discountFixed > 0;
        $discount = 0.0;

        if ($discountType === 'before_tax') {
            if ($usePercent) {
                $discount = $subtotal * $discountPercent / 100;
                $taxes = array_map(fn ($t) => $t - $t * $discountPercent / 100, $taxes);
            } elseif ($useFixed && $subtotal > 0) {
                $discount = $discountFixed;
                $share = $discountFixed / $subtotal * 100;
                $taxes = array_map(fn ($t) => $t - $t * $share / 100, $taxes);
            }
        }

        $totalTax = array_sum($taxes);
        $total = $subtotal + $totalTax;

        if ($discountType === 'after_tax') {
            $discount = $usePercent ? $total * $discountPercent / 100 : ($useFixed ? $discountFixed : 0.0);
        }

        $total = $total - $discount + $adjustment;

        return [
            'subtotal' => round($subtotal, 2),
            'total_tax' => round($totalTax, 2),
            'discount_total' => round($discount, 2),
            'total' => round($total, 2),
            'taxes' => array_map(fn ($t) => round($t, 2), $taxes),
        ];
    }
}
