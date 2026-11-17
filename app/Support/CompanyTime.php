<?php

namespace App\Support;

use App\Services\Options;
use Illuminate\Support\Carbon;

/**
 * The company's own clock (Setup → Company Information → Timezone, set from its country at sign
 * up). The app stores UTC; "today", day boundaries and dates shown in text follow this zone.
 */
class CompanyTime
{
    public const DEFAULT = 'Asia/Kolkata';

    public static function zone(?int $companyId = null): string
    {
        $zone = Options::get('timezone', $companyId);

        return in_array($zone, timezone_identifiers_list(), true) ? $zone : self::DEFAULT;
    }

    public static function today(?int $companyId = null): Carbon
    {
        return Carbon::today(self::zone($companyId));
    }

    public static function now(?int $companyId = null): Carbon
    {
        return Carbon::now(self::zone($companyId));
    }

    /** A stored (UTC) time as the company reads it, e.g. "18 Nov 2026, 10:00 AM". */
    public static function format(mixed $value, string $format = 'd M Y, h:i A', ?int $companyId = null): string
    {
        return Carbon::parse($value)->setTimezone(self::zone($companyId))->format($format);
    }
}
