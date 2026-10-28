<?php

namespace App\Support;

/**
 * Indian-style amount in words (lakh / crore), as GIC prints under the invoice total.
 */
class AmountInWords
{
    private const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
        'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    private const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    public static function convert(float $amount, string $currency = 'Rupees', string $fraction = 'Paise'): string
    {
        $rupees = (int) floor(abs($amount));
        $paise = (int) round((abs($amount) - $rupees) * 100);

        $words = $rupees === 0 ? 'Zero' : self::number($rupees);
        $result = "{$currency} {$words}";
        if ($paise > 0) {
            $result .= " and {$fraction} ".self::number($paise);
        }

        return $result.' Only';
    }

    private static function number(int $n): string
    {
        $parts = [];
        foreach ([[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']] as [$size, $name]) {
            if ($n >= $size) {
                $parts[] = self::number(intdiv($n, $size)).' '.$name;
                $n %= $size;
            }
        }
        if ($n > 0) {
            $parts[] = $n < 20 ? self::ONES[$n] : trim(self::TENS[intdiv($n, 10)].' '.self::ONES[$n % 10]);
        }

        return implode(' ', $parts);
    }
}
