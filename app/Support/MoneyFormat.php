<?php

namespace App\Support;

use App\Models\Currency;

/**
 * Amounts on PDFs, written like the rest of the app: the currency's own separators (Setup →
 * Currencies), Indian digit grouping (12,34,567.50) for rupees, symbol before or after.
 */
class MoneyFormat
{
    public static function number(float|int|string|null $value, ?Currency $currency = null): string
    {
        $value = round((float) $value, 2);
        $decimal = (string) ($currency?->decimal_separator ?: '.');
        $thousands = (string) ($currency?->thousand_separator ?? ',');
        [$whole, $fraction] = explode('.', number_format(abs($value), 2, '.', ''));

        if (self::isRupee($currency) && strlen($whole) > 3) {
            // Last three digits, then pairs: 12,34,567
            $head = substr($whole, 0, -3);
            $whole = implode($thousands, str_split(str_pad($head, (int) (ceil(strlen($head) / 2) * 2), ' ', STR_PAD_LEFT), 2)).$thousands.substr($whole, -3);
            $whole = ltrim($whole);
        } else {
            $whole = number_format((float) $whole, 0, '', $thousands);
        }

        return ($value < 0 ? '-' : '').$whole.$decimal.$fraction;
    }

    public static function money(float|int|string|null $value, ?Currency $currency = null): string
    {
        $number = self::number(abs((float) $value), $currency);
        $symbol = (string) ($currency?->symbol ?? '₹');
        $sign = round((float) $value, 2) < 0 ? '-' : '';

        return $sign.($currency?->placement === 'after' ? $number.' '.$symbol : $symbol.$number);
    }

    /**
     * "Amount in words" for this currency: rupees and paise for INR, the currency's name and
     * cents otherwise.
     */
    public static function words(float $amount, ?Currency $currency = null): string
    {
        return self::isRupee($currency)
            ? AmountInWords::convert($amount)
            : AmountInWords::convert($amount, (string) ($currency?->name ?: 'Units'), 'Cents');
    }

    private static function isRupee(?Currency $currency): bool
    {
        return $currency === null || strtoupper((string) $currency->name) === 'INR' || $currency->symbol === '₹';
    }
}
