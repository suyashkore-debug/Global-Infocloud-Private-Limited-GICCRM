<?php

namespace App\Services;

use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Each company sends with its own SMTP account (Setup → Email). Without SMTP settings the
 * app's default mailer is used (the "log" mailer in development).
 */
class CompanyMailer
{
    public const KEYS = ['smtp_host', 'smtp_port', 'smtp_encryption', 'smtp_username', 'smtp_password', 'smtp_email', 'smtp_from_name', 'email_signature', 'email_header', 'email_footer'];

    public static function mailer(int $companyId): Mailer
    {
        $host = Options::get('smtp_host', $companyId);
        if ($host === '') {
            return Mail::mailer();
        }

        $name = "company_smtp_{$companyId}";
        config(["mail.mailers.{$name}" => [
            'transport' => 'smtp',
            'scheme' => Options::get('smtp_encryption', $companyId) === 'ssl' ? 'smtps' : 'smtp',
            'host' => $host,
            'port' => (int) (Options::get('smtp_port', $companyId) ?: 587),
            'username' => Options::get('smtp_username', $companyId) ?: null,
            'password' => self::password($companyId),
            'timeout' => 30,
        ]]);
        Mail::purge($name);

        return Mail::mailer($name);
    }

    /**
     * @return array{address: string, name: string}
     */
    public static function from(int $companyId, ?string $fromName = null): array
    {
        return [
            'address' => Options::get('smtp_email', $companyId) ?: (string) config('mail.from.address'),
            'name' => $fromName ?: (Options::get('smtp_from_name', $companyId) ?: (Options::companyName($companyId) ?: (string) config('mail.from.name'))),
        ];
    }

    public static function setPassword(string $plain, int $companyId): void
    {
        Options::set('smtp_password', $plain === '' ? '' : Crypt::encryptString($plain), $companyId);
    }

    private static function password(int $companyId): ?string
    {
        $stored = Options::get('smtp_password', $companyId);
        if ($stored === '') {
            return null;
        }
        try {
            return Crypt::decryptString($stored);
        } catch (Throwable) {
            return null;
        }
    }
}
