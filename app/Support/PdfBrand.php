<?php

namespace App\Support;

use App\Models\Company;
use Barryvdh\DomPDF\PDF;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * The look shared by every PDF: the company's HRMS logo (embedded, so dompdf needs no network
 * access) and the brand colours.
 */
class PdfBrand
{
    public const NAVY = '#0b2c56';

    public const ORANGE = '#fa6010';

    private const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

    /**
     * The company logo as a data URI, or null when it has none or it can't be fetched. Cached per
     * logo file for a day.
     */
    public static function logo(int $companyId): ?string
    {
        $url = Company::find($companyId)?->logoUrl();
        if (! $url) {
            return null;
        }

        return Cache::remember('pdf-logo:'.md5($url), now()->addDay(), function () use ($url) {
            try {
                $response = Http::timeout(4)->get($url);
                $type = strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0]));
                if (! $response->successful() || ! in_array($type, self::IMAGE_TYPES, true) || strlen($response->body()) > 2_000_000) {
                    return '';
                }

                return 'data:'.$type.';base64,'.base64_encode($response->body());
            } catch (Throwable) {
                return '';
            }
        }) ?: null;
    }

    /**
     * Settings → PDF "Show page number": "Page n / total" in the footer's right corner. dompdf only
     * knows the total once laid out, so this renders the PDF and writes on each page's canvas.
     *
     * @param  array<string, string>  $options
     */
    public static function pageNumbers(PDF $pdf, array $options): PDF
    {
        if (($options['show_page_number_on_pdf'] ?? '1') !== '1') {
            return $pdf;
        }
        $pdf->render();
        $dompdf = $pdf->getDomPDF();
        $canvas = $dompdf->getCanvas();
        $font = $dompdf->getFontMetrics()->getFont('DejaVu Sans');
        $text = 'Page {PAGE_NUM} / {PAGE_COUNT}';
        $width = $dompdf->getFontMetrics()->getTextWidth('Page 00 / 00', $font, 7);
        $canvas->page_text($canvas->get_width() - 38 - $width, $canvas->get_height() - 24, $text, $font, 7, [0.58, 0.64, 0.72]);

        return $pdf;
    }

    /**
     * Settings → PDF table heading colour, when it is a valid hex colour.
     */
    public static function color(?string $value, string $fallback): string
    {
        return preg_match('/^#[0-9a-fA-F]{6}$/', (string) $value) ? (string) $value : $fallback;
    }
}
