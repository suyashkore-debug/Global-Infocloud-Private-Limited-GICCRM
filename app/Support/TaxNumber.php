<?php

namespace App\Support;

use App\Services\Options;
use Closure;

/**
 * A company's, customer's or vendor's tax number checked by its country: India's GSTIN and PAN,
 * the UAE's 15-digit TRN, a UK VAT number, ... Countries without a known format take any text.
 */
class TaxNumber
{
    /** The Indian Permanent Account Number: 5 letters, 4 digits, 1 letter. */
    public const PAN = '^[A-Z]{5}[0-9]{4}[A-Z]$';

    /** country => [pattern (works in PHP and JavaScript), example] */
    private const FORMATS = [
        'India' => ['^(0[1-9]|[1-3][0-9]|9[79])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$', '27ABCDE1234F1Z5'],
        'United Arab Emirates' => ['^1[0-9]{14}$', '100123456700003'],
        'Saudi Arabia' => ['^3[0-9]{13}3$', '310123456700003'],
        'Bahrain' => ['^[0-9]{15}$', '200012345600002'],
        'Oman' => ['^OM[0-9]{10}$', 'OM1100012345'],
        'United Kingdom' => ['^(GB)?([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$', 'GB123456789'],
        'United States' => ['^[0-9]{2}-?[0-9]{7}$', '12-3456789'],
        'Canada' => ['^[0-9]{9}(RT[0-9]{4})?$', '123456789RT0001'],
        'Australia' => ['^[0-9]{11}$', '51824753556'],
        'New Zealand' => ['^[0-9]{8,9}$', '123456789'],
        'Germany' => ['^DE[0-9]{9}$', 'DE123456789'],
        'France' => ['^FR[0-9A-Z]{2}[0-9]{9}$', 'FR12345678901'],
        'Italy' => ['^(IT)?[0-9]{11}$', 'IT12345678901'],
        'Spain' => ['^(ES)?[0-9A-Z][0-9]{7}[0-9A-Z]$', 'ESB12345678'],
        'Netherlands' => ['^NL[0-9]{9}B[0-9]{2}$', 'NL123456789B01'],
        'Belgium' => ['^BE[01][0-9]{9}$', 'BE0123456789'],
        'Ireland' => ['^IE[0-9][0-9A-Z+*][0-9]{5}[A-Z]{1,2}$', 'IE1234567T'],
        'Portugal' => ['^(PT)?[0-9]{9}$', 'PT123456789'],
        'Poland' => ['^(PL)?[0-9]{10}$', 'PL1234567890'],
        'Sweden' => ['^(SE)?[0-9]{12}$', 'SE123456789001'],
        'Denmark' => ['^(DK)?[0-9]{8}$', 'DK12345678'],
        'Pakistan' => ['^[0-9]{7}-?[0-9]$', '1234567-8'],
        'Bangladesh' => ['^[0-9]{9}(-?[0-9]{4})?$', '000123456-0101'],
        'Nepal' => ['^[0-9]{9}$', '123456789'],
        'Singapore' => ['^([0-9]{8,9}[A-Z]|[A-Z][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z]|M[0-9]-?[0-9]{7}-?[0-9A-Z])$', '201912345K'],
        'Malaysia' => ['^[A-Z][0-9]{2}-?[0-9]{4}-?[0-9]{8}$', 'W10-1808-32000001'],
        'Mexico' => ['^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$', 'ABC680524P76'],
        'South Africa' => ['^4[0-9]{9}$', '4123456789'],
    ];

    /** A tax number as stored: upper case, no spaces or dots. */
    public static function normalize(?string $value): ?string
    {
        $value = strtoupper((string) preg_replace('/[\s.]+/', '', (string) $value));

        return $value === '' ? null : $value;
    }

    /** The given country, or the company's own when none is set. */
    public static function country(?string $country): string
    {
        $country = trim((string) $country);

        return $country !== '' ? $country : ((string) Options::get('company_country') ?: 'India');
    }

    /** PAN is India's alone. */
    public static function hasPan(?string $country): bool
    {
        return self::country($country) === 'India';
    }

    /** What the tax number is called: the company's own label (Setup) for its country, else the country's. */
    public static function label(?string $country): string
    {
        $country = self::country($country);
        $own = (string) Options::get('company_country') ?: 'India';

        return $country === $own ? ((string) Options::get('tax_id_label') ?: CountryProfile::for($country)['tax_label']) : CountryProfile::for($country)['tax_label'];
    }

    /**
     * @return array{pattern: ?string, example: ?string}
     */
    public static function format(?string $country): array
    {
        [$pattern, $example] = self::FORMATS[self::country($country)] ?? [null, null];

        return ['pattern' => $pattern, 'example' => $example];
    }

    /** Whether a (normalized) tax number fits its country; any text where no format is known. */
    public static function valid(?string $value, ?string $country): bool
    {
        $value = self::normalize($value);
        $pattern = self::format($country)['pattern'];

        return $value === null || $pattern === null || preg_match('/'.$pattern.'/u', $value) === 1;
    }

    /** A validation rule for a tax number of the given country. */
    public static function rule(?string $country): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($country) {
            if (! self::valid(is_string($value) ? $value : null, $country)) {
                $format = self::format($country);
                $fail('Enter a valid '.self::label($country).' for '.self::country($country).', e.g. '.$format['example'].'.');
            }
        };
    }

    /**
     * A validation rule for a PAN: India only, 10 characters, and the same as the one inside the GSTIN.
     */
    public static function panRule(?string $country, ?string $gstin): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($country, $gstin) {
            $pan = self::normalize(is_string($value) ? $value : null);
            if ($pan === null) {
                return;
            }
            if (! self::hasPan($country)) {
                $fail('PAN is only for Indian companies.');
            } elseif (preg_match('/'.self::PAN.'/', $pan) !== 1) {
                $fail('Enter a valid 10-character PAN, e.g. ABCDE1234F.');
            } elseif (($inside = self::panFromGstin($gstin)) && $inside !== $pan) {
                $fail("The PAN does not match the GSTIN (its PAN is {$inside}).");
            }
        };
    }

    /** The PAN inside a valid Indian GSTIN (characters 3 to 12). */
    public static function panFromGstin(?string $gstin): ?string
    {
        $gstin = self::normalize($gstin);

        return $gstin !== null && self::valid($gstin, 'India') && strlen($gstin) === 15 ? substr($gstin, 2, 10) : null;
    }

    /**
     * Every known format, for the forms.
     *
     * @return array<string, array{pattern: string, example: string}>
     */
    public static function formats(): array
    {
        return collect(self::FORMATS)->map(fn ($f) => ['pattern' => $f[0], 'example' => $f[1]])->all();
    }
}
