<?php

namespace App\Support;

use App\Models\Lead;

/**
 * Phone numbers as WhatsApp and calling providers use them: digits with the country code
 * (e.g. 919876543210), and the lead a number belongs to.
 */
class PhoneNumber
{
    /**
     * Numbers typed without a country code (e.g. "98765 43210" or "098765 43210") get the
     * given default code.
     */
    public static function normalize(?string $phone, string $defaultCode): ?string
    {
        $phone = trim((string) $phone);
        $digits = preg_replace('/\D/', '', $phone);
        if ($digits === '') {
            return null;
        }
        if (str_starts_with($phone, '+')) {
            return $digits;
        }
        if (str_starts_with($digits, '00')) {
            return substr($digits, 2);
        }
        $code = preg_replace('/\D/', '', $defaultCode);
        $local = ltrim($digits, '0');
        if (strlen($local) <= 10 && $code !== '') {
            return $code.$local;
        }

        return $digits;
    }

    /**
     * The newest lead of the company whose phone is this number (already normalized).
     */
    public static function findLead(int $companyId, string $number, string $defaultCode): ?Lead
    {
        return Lead::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where('phone', 'like', '%'.substr($number, -4).'%')
            ->orderByDesc('id')
            ->get()
            ->first(fn (Lead $l) => self::normalize($l->phone, $defaultCode) === $number);
    }
}
