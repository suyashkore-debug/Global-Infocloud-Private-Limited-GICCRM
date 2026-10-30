<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Google reCAPTCHA (v2 "I'm not a robot") for the public web forms, as in Perfex: it is used only
 * when the company has saved both keys in Setup → reCAPTCHA and the form has it turned on.
 */
class Recaptcha
{
    public static function siteKey(int $companyId): string
    {
        return Options::get('recaptcha_site_key', $companyId);
    }

    /** Both keys are saved (Perfex show_recaptcha()). */
    public static function enabled(int $companyId): bool
    {
        return self::siteKey($companyId) !== '' && Options::secret('recaptcha_secret_key', $companyId) !== '';
    }

    /** The site key a form's page should render with, or null when the form needs no captcha. */
    public static function forForm(bool $formUsesIt, int $companyId): ?string
    {
        return $formUsesIt && self::enabled($companyId) ? self::siteKey($companyId) : null;
    }

    /**
     * Stops the request (422 on "recaptcha") unless Google confirms the visitor's token.
     *
     * @throws ValidationException
     */
    public static function check(?string $token, ?string $ip, int $companyId): void
    {
        $ok = false;
        if ($token) {
            try {
                $ok = (bool) Http::asForm()->timeout(10)->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => Options::secret('recaptcha_secret_key', $companyId),
                    'response' => $token,
                    'remoteip' => $ip,
                ])->json('success');
            } catch (Throwable) {
                $ok = false;
            }
        }
        if (! $ok) {
            throw ValidationException::withMessages(['recaptcha' => 'Please confirm that you are not a robot.']);
        }
    }
}
