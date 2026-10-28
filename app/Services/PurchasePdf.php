<?php

namespace App\Services;

use App\Models\Company;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseOrder;
use App\Support\PdfBrand;
use Barryvdh\DomPDF\Facade\Pdf;
use Symfony\Component\HttpFoundation\Response;

/**
 * Perfex-style PDF of a purchase order or a purchase invoice (vendor bill).
 */
class PurchasePdf
{
    public static function render(PurchaseOrder|PurchaseInvoice $document, bool $inline): Response
    {
        $document->load(['items', 'vendor', 'currency']);
        $companyId = (int) $document->company_id;
        $isOrder = $document instanceof PurchaseOrder;
        $number = $isOrder ? $document->code : $document->invoice_number;

        $pdf = Pdf::setOption(['isFontSubsettingEnabled' => true])->loadView('pdf.purchase', [
            'document' => $document,
            'heading' => $isOrder ? 'PURCHASE ORDER' : 'PURCHASE INVOICE',
            'number' => $number,
            'infoRows' => $isOrder
                ? ['Order Date' => $document->order_date?->format('d-m-Y'), 'Delivery Date' => $document->delivery_date?->format('d-m-Y'), 'Order Name' => $document->name]
                : ['Invoice Date' => $document->invoice_date?->format('d-m-Y'), 'Due Date' => $document->due_date?->format('d-m-Y'), 'Vendor Invoice #' => $document->vendor_invoice_number],
            'options' => Options::all($companyId),
            'logo' => PdfBrand::logo($companyId),
            'companyName' => Options::companyName($companyId) ?: (string) Company::find($companyId)?->company_name,
        ]);
        PdfBrand::pageNumbers($pdf, Options::all($companyId));
        $name = str_replace(['/', '\\', '#', ' '], ['-', '-', '', ''], $number).'.pdf';

        return $inline ? $pdf->stream($name) : $pdf->download($name);
    }
}
