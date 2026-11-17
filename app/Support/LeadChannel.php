<?php

namespace App\Support;

use App\Models\LeadSource;

/**
 * Where a web form visitor came from: the "source" (or utm_source) on the form's link, else the
 * site that sent them (a Facebook or Instagram post). Known channels become the lead's source,
 * created on first use, so one form shared on Facebook, Instagram and WhatsApp tells the leads apart.
 */
class LeadChannel
{
    /** Link values and the source name each one means. */
    public const CHANNELS = [
        'facebook' => 'Facebook', 'fb' => 'Facebook',
        'instagram' => 'Instagram', 'insta' => 'Instagram', 'ig' => 'Instagram',
        'whatsapp' => 'WhatsApp', 'wa' => 'WhatsApp',
        'linkedin' => 'LinkedIn', 'li' => 'LinkedIn',
        'youtube' => 'YouTube', 'yt' => 'YouTube',
        'twitter' => 'Twitter (X)', 'x' => 'Twitter (X)',
        'google' => 'Google', 'googleads' => 'Google Ads', 'adwords' => 'Google Ads',
        'website' => 'Website', 'web' => 'Website',
        'email' => 'Email', 'sms' => 'SMS', 'qr' => 'QR Code',
    ];

    /** Sites that send visitors, read from the referring page when the link names no channel. */
    private const REFERRERS = [
        'facebook.com' => 'Facebook', 'fb.com' => 'Facebook', 'fb.me' => 'Facebook',
        'instagram.com' => 'Instagram',
        'whatsapp.com' => 'WhatsApp', 'wa.me' => 'WhatsApp',
        'linkedin.com' => 'LinkedIn', 'lnkd.in' => 'LinkedIn',
        'youtube.com' => 'YouTube', 'youtu.be' => 'YouTube',
        't.co' => 'Twitter (X)', 'twitter.com' => 'Twitter (X)', 'x.com' => 'Twitter (X)',
        'google.' => 'Google',
    ];

    /** The channel name for a link value or referring page, or null when it is not a known one. */
    public static function name(?string $source, ?string $referrer): ?string
    {
        $key = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $source));
        if ($key !== '' && isset(self::CHANNELS[$key])) {
            return self::CHANNELS[$key];
        }
        $host = strtolower((string) parse_url((string) $referrer, PHP_URL_HOST));
        foreach (self::REFERRERS as $needle => $name) {
            if ($host !== '' && str_contains($host, $needle)) {
                return $name;
            }
        }

        return null;
    }

    /** The company's lead source for the channel (same name, any case), added when missing. */
    public static function source(string $name, int $companyId): LeadSource
    {
        return LeadSource::whereRaw('lower(name) = ?', [strtolower($name)])->first()
            ?? LeadSource::create(['company_id' => $companyId, 'name' => $name]);
    }
}
