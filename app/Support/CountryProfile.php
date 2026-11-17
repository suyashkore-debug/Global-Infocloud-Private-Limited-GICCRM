<?php

namespace App\Support;

/**
 * What a company's country sets up at sign-up: its timezone, currency, phone country code, the
 * locale for dates and numbers, and the name of its tax number (GSTIN, VAT, ...).
 */
class CountryProfile
{
    /** country => [timezone, currency code, currency symbol, phone code, locale, tax id label] */
    private const PROFILES = [
        'India' => ['Asia/Kolkata', 'INR', '₹', '91', 'en-IN', 'GSTIN'],
        'United States' => ['America/New_York', 'USD', '$', '1', 'en-US', 'EIN'],
        'United Kingdom' => ['Europe/London', 'GBP', '£', '44', 'en-GB', 'VAT No.'],
        'Canada' => ['America/Toronto', 'CAD', 'C$', '1', 'en-CA', 'GST/HST No.'],
        'Australia' => ['Australia/Sydney', 'AUD', 'A$', '61', 'en-AU', 'ABN'],
        'New Zealand' => ['Pacific/Auckland', 'NZD', 'NZ$', '64', 'en-NZ', 'GST No.'],
        'United Arab Emirates' => ['Asia/Dubai', 'AED', 'AED', '971', 'en-AE', 'TRN'],
        'Saudi Arabia' => ['Asia/Riyadh', 'SAR', 'SAR', '966', 'en-SA', 'VAT No.'],
        'Qatar' => ['Asia/Qatar', 'QAR', 'QAR', '974', 'en-QA', 'Tax ID'],
        'Kuwait' => ['Asia/Kuwait', 'KWD', 'KWD', '965', 'en-KW', 'Tax ID'],
        'Oman' => ['Asia/Muscat', 'OMR', 'OMR', '968', 'en-OM', 'VAT No.'],
        'Bahrain' => ['Asia/Bahrain', 'BHD', 'BHD', '973', 'en-BH', 'VAT No.'],
        'Singapore' => ['Asia/Singapore', 'SGD', 'S$', '65', 'en-SG', 'GST Reg. No.'],
        'Malaysia' => ['Asia/Kuala_Lumpur', 'MYR', 'RM', '60', 'en-MY', 'SST No.'],
        'Indonesia' => ['Asia/Jakarta', 'IDR', 'Rp', '62', 'id-ID', 'NPWP'],
        'Philippines' => ['Asia/Manila', 'PHP', '₱', '63', 'en-PH', 'TIN'],
        'Thailand' => ['Asia/Bangkok', 'THB', '฿', '66', 'th-TH', 'Tax ID'],
        'Vietnam' => ['Asia/Ho_Chi_Minh', 'VND', '₫', '84', 'vi-VN', 'Tax Code'],
        'China' => ['Asia/Shanghai', 'CNY', '¥', '86', 'zh-CN', 'Tax ID'],
        'Hong Kong' => ['Asia/Hong_Kong', 'HKD', 'HK$', '852', 'en-HK', 'BR No.'],
        'Japan' => ['Asia/Tokyo', 'JPY', '¥', '81', 'ja-JP', 'Tax ID'],
        'South Korea' => ['Asia/Seoul', 'KRW', '₩', '82', 'ko-KR', 'BRN'],
        'Pakistan' => ['Asia/Karachi', 'PKR', 'Rs', '92', 'en-PK', 'NTN'],
        'Bangladesh' => ['Asia/Dhaka', 'BDT', '৳', '880', 'en-BD', 'BIN'],
        'Sri Lanka' => ['Asia/Colombo', 'LKR', 'Rs', '94', 'en-LK', 'VAT No.'],
        'Nepal' => ['Asia/Kathmandu', 'NPR', 'Rs', '977', 'en-NP', 'PAN'],
        'Bhutan' => ['Asia/Thimphu', 'BTN', 'Nu.', '975', 'en-BT', 'TPN'],
        'Maldives' => ['Indian/Maldives', 'MVR', 'Rf', '960', 'en-MV', 'TIN'],
        'Germany' => ['Europe/Berlin', 'EUR', '€', '49', 'de-DE', 'USt-IdNr.'],
        'France' => ['Europe/Paris', 'EUR', '€', '33', 'fr-FR', 'N° TVA'],
        'Italy' => ['Europe/Rome', 'EUR', '€', '39', 'it-IT', 'Partita IVA'],
        'Spain' => ['Europe/Madrid', 'EUR', '€', '34', 'es-ES', 'NIF'],
        'Netherlands' => ['Europe/Amsterdam', 'EUR', '€', '31', 'nl-NL', 'BTW-nr'],
        'Belgium' => ['Europe/Brussels', 'EUR', '€', '32', 'nl-BE', 'VAT No.'],
        'Ireland' => ['Europe/Dublin', 'EUR', '€', '353', 'en-IE', 'VAT No.'],
        'Portugal' => ['Europe/Lisbon', 'EUR', '€', '351', 'pt-PT', 'NIF'],
        'Switzerland' => ['Europe/Zurich', 'CHF', 'CHF', '41', 'de-CH', 'UID'],
        'Sweden' => ['Europe/Stockholm', 'SEK', 'kr', '46', 'sv-SE', 'Momsnr'],
        'Norway' => ['Europe/Oslo', 'NOK', 'kr', '47', 'nb-NO', 'MVA'],
        'Denmark' => ['Europe/Copenhagen', 'DKK', 'kr', '45', 'da-DK', 'CVR'],
        'Poland' => ['Europe/Warsaw', 'PLN', 'zł', '48', 'pl-PL', 'NIP'],
        'Turkey' => ['Europe/Istanbul', 'TRY', '₺', '90', 'tr-TR', 'VKN'],
        'Russia' => ['Europe/Moscow', 'RUB', '₽', '7', 'ru-RU', 'INN'],
        'Israel' => ['Asia/Jerusalem', 'ILS', '₪', '972', 'he-IL', 'VAT No.'],
        'Egypt' => ['Africa/Cairo', 'EGP', 'E£', '20', 'en-EG', 'Tax ID'],
        'South Africa' => ['Africa/Johannesburg', 'ZAR', 'R', '27', 'en-ZA', 'VAT No.'],
        'Nigeria' => ['Africa/Lagos', 'NGN', '₦', '234', 'en-NG', 'TIN'],
        'Kenya' => ['Africa/Nairobi', 'KES', 'KSh', '254', 'en-KE', 'KRA PIN'],
        'Ghana' => ['Africa/Accra', 'GHS', 'GH₵', '233', 'en-GH', 'TIN'],
        'Tanzania' => ['Africa/Dar_es_Salaam', 'TZS', 'TSh', '255', 'en-TZ', 'TIN'],
        'Uganda' => ['Africa/Kampala', 'UGX', 'USh', '256', 'en-UG', 'TIN'],
        'Mexico' => ['America/Mexico_City', 'MXN', 'MX$', '52', 'es-MX', 'RFC'],
        'Brazil' => ['America/Sao_Paulo', 'BRL', 'R$', '55', 'pt-BR', 'CNPJ'],
        'Argentina' => ['America/Argentina/Buenos_Aires', 'ARS', 'AR$', '54', 'es-AR', 'CUIT'],
        'Chile' => ['America/Santiago', 'CLP', 'CLP$', '56', 'es-CL', 'RUT'],
        'Colombia' => ['America/Bogota', 'COP', 'COL$', '57', 'es-CO', 'NIT'],
    ];

    /** Countries nobody listed above: UTC, US dollars, international formats. */
    private const FALLBACK = ['UTC', 'USD', '$', '', 'en-US', 'Tax ID'];

    /**
     * @return array{country: string, timezone: string, currency: string, symbol: string, phone_code: string, locale: string, tax_label: string, tax_pattern: ?string, tax_example: ?string, has_pan: bool}
     */
    public static function for(string $country): array
    {
        [$timezone, $currency, $symbol, $phone, $locale, $tax] = self::PROFILES[$country] ?? self::FALLBACK;
        // Its tax number's format (GSTIN, TRN, VAT …), and PAN for India.
        $format = TaxNumber::formats()[$country] ?? ['pattern' => null, 'example' => null];

        return ['country' => $country, 'timezone' => $timezone, 'currency' => $currency, 'symbol' => $symbol, 'phone_code' => $phone, 'locale' => $locale, 'tax_label' => $tax,
            'tax_pattern' => $format['pattern'], 'tax_example' => $format['example'], 'has_pan' => $country === 'India'];
    }

    /**
     * Every listed country's profile, for the sign-up form.
     *
     * @return array<string, array<string, string>>
     */
    public static function all(): array
    {
        return collect(array_keys(self::PROFILES))->mapWithKeys(fn ($c) => [$c => self::for($c)])->all();
    }
}
