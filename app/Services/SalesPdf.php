<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Contract;
use App\Models\CreditNote;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\PaymentMode;
use App\Models\Proposal;
use App\Support\PdfBrand;
use App\Support\RichText;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Model;
use Symfony\Component\HttpFoundation\Response;

/**
 * Perfex-style PDFs of invoices, estimates, credit notes and proposals (one template).
 */
class SalesPdf
{
    /** Perfex PDF status colours. */
    private const RED = '#fc2d42';

    private const GREEN = '#84c529';

    private const ORANGE = '#ff6f00';

    private const GREY = '#777777';

    private const BLUE = '#03a9f4';

    public static function invoice(Invoice $invoice, bool $inline): Response
    {
        $invoice->load(['customer', 'project', 'currency', 'saleAgent', 'items.taxes', 'payments.paymentMode', 'appliedCredits']);
        $colors = [1 => self::RED, 2 => self::GREEN, 3 => self::ORANGE, 4 => self::ORANGE, 5 => self::GREY, 6 => self::GREY];

        return self::render($invoice, $inline, [
            'heading' => 'INVOICE',
            'number' => $invoice->formattedNumber(),
            'status' => [$invoice->status->label(), $colors[$invoice->status->value] ?? self::GREY],
            'billTo' => self::customerBlock($invoice),
            'shipTo' => self::shipTo($invoice, $invoice->include_shipping && $invoice->show_shipping_on_invoice),
            'infoRows' => [
                'Invoice Date' => $invoice->date->format('d-m-Y'),
                'Due Date' => $invoice->due_date?->format('d-m-Y'),
                'Sale Agent' => $invoice->saleAgent?->full_name,
                'Project' => $invoice->project?->name,
            ],
            'payments' => Options::get('show_transactions_on_invoice_pdf', (int) $invoice->company_id) === '1' ? $invoice->payments : null,
            'amountPaid' => $invoice->amountPaid(),
            'amountCredited' => $invoice->amountCredited(),
            'amountDue' => $invoice->amountDue(),
            'paymentModes' => PaymentMode::whereIn('id', $invoice->allowed_payment_modes ?? [])->where('show_on_pdf', true)->get(),
        ]);
    }

    public static function estimate(Estimate $estimate, bool $inline): Response
    {
        $estimate->load(['customer', 'project', 'currency', 'saleAgent', 'items.taxes']);
        $colors = [1 => self::GREY, 2 => self::BLUE, 3 => self::RED, 4 => self::GREEN, 5 => self::ORANGE];

        return self::render($estimate, $inline, [
            'heading' => 'ESTIMATE',
            'number' => $estimate->formattedNumber(),
            'status' => [$estimate->status->label(), $colors[$estimate->status->value] ?? self::GREY],
            'billTo' => self::customerBlock($estimate),
            'shipTo' => self::shipTo($estimate, $estimate->include_shipping && $estimate->show_shipping),
            'infoRows' => [
                'Estimate Date' => $estimate->date->format('d-m-Y'),
                'Expiry Date' => $estimate->expiry_date?->format('d-m-Y'),
                'Reference #' => $estimate->reference_no,
                'Sale Agent' => $estimate->saleAgent?->full_name,
                'Project' => $estimate->project?->name,
            ],
        ]);
    }

    public static function creditNote(CreditNote $note, bool $inline): Response
    {
        $note->load(['customer', 'project', 'currency', 'items.taxes']);
        $colors = [1 => self::BLUE, 2 => self::GREEN, 3 => self::GREY];

        return self::render($note, $inline, [
            'heading' => 'CREDIT NOTE',
            'number' => $note->formattedNumber(),
            'status' => [$note->status->label(), $colors[$note->status->value] ?? self::GREY],
            'billTo' => self::customerBlock($note),
            'shipTo' => self::shipTo($note, $note->include_shipping && $note->show_shipping),
            'infoRows' => [
                'Credit Note Date' => $note->date->format('d-m-Y'),
                'Reference #' => $note->reference_no,
                'Project' => $note->project?->name,
            ],
            'amountCredited' => (float) $note->appliedCredits()->sum('amount') + (float) $note->refunds()->sum('amount'),
            'amountDue' => $note->remainingCredits(),
            'amountDueLabel' => 'Remaining Amount',
        ]);
    }

    public static function proposal(Proposal $proposal, bool $inline): Response
    {
        $proposal->load(['customer', 'project', 'currency', 'items.taxes']);
        $colors = [1 => self::BLUE, 2 => self::RED, 3 => self::GREEN, 4 => self::BLUE, 5 => self::ORANGE, 6 => self::GREY];

        return self::render($proposal, $inline, [
            'heading' => 'PROPOSAL',
            'number' => $proposal->formattedNumber(),
            'status' => [$proposal->status->label(), $colors[$proposal->status->value] ?? self::GREY],
            'billToLabel' => 'To',
            'billTo' => [
                'name' => (string) $proposal->proposal_to,
                'lines' => [
                    $proposal->address,
                    collect([$proposal->city, $proposal->state])->filter()->implode(', '),
                    collect([$proposal->country, $proposal->zip])->filter()->implode(' '),
                    $proposal->email,
                    $proposal->phone,
                ],
            ],
            'infoRows' => [
                'Subject' => $proposal->subject,
                'Date' => $proposal->date->format('d-m-Y'),
                'Open Till' => $proposal->open_till?->format('d-m-Y'),
            ],
            'intro' => RichText::toHtml($proposal->content),
        ]);
    }

    public static function contract(Contract $contract, bool $inline): Response
    {
        $contract->load(['customer', 'type']);
        $companyId = (int) $contract->company_id;
        $pdf = self::paper(Pdf::setOption(['isFontSubsettingEnabled' => true]), $companyId)->loadView('pdf.contract', [
            'contract' => $contract,
            'options' => Options::all($companyId),
            'logo' => PdfBrand::logo($companyId),
            'companyName' => Options::get('company_name', $companyId) ?: (string) Company::find($companyId)?->company_name,
        ]);
        PdfBrand::pageNumbers($pdf, Options::all($companyId));
        $name = 'Contract-'.$contract->id.'.pdf';

        return $inline ? $pdf->stream($name) : $pdf->download($name);
    }

    /**
     * Settings → PDF "Document format": A4 or Letter, portrait or landscape.
     */
    private static function paper(\Barryvdh\DomPDF\PDF $pdf, int $companyId): \Barryvdh\DomPDF\PDF
    {
        [$size, $orientation] = array_pad(explode('-', strtolower(Options::get('pdf_format', $companyId))), 2, 'portrait');

        return $pdf->setPaper(in_array($size, ['a4', 'letter'], true) ? $size : 'a4', $orientation === 'landscape' ? 'landscape' : 'portrait');
    }

    /**
     * A document's PDF as an e-mail attachment.
     *
     * @return array{name: string, mime: string, data: string}
     */
    public static function attachment(Model $document): array
    {
        $response = match (true) {
            $document instanceof Invoice => self::invoice($document, false),
            $document instanceof Estimate => self::estimate($document, false),
            $document instanceof CreditNote => self::creditNote($document, false),
            $document instanceof Proposal => self::proposal($document, false),
            $document instanceof Contract => self::contract($document, false),
        };
        $name = $document instanceof Contract ? 'Contract-'.$document->id : str_replace(['/', '\\'], '-', $document->formattedNumber());

        return ['name' => $name.'.pdf', 'mime' => 'application/pdf', 'data' => (string) $response->getContent()];
    }

    /**
     * @param  array<string, mixed>  $vars
     */
    private static function render(Model $document, bool $inline, array $vars): Response
    {
        $companyId = (int) $document->company_id;
        // Custom fields marked "Show on PDF" are listed with the document's details.
        $fieldTo = match (true) {
            $document instanceof Invoice => 'invoice',
            $document instanceof Estimate => 'estimate',
            $document instanceof CreditNote => 'credit_note',
            default => 'proposal',
        };
        foreach (CustomFields::forPdf($fieldTo, (int) $document->id, $companyId) as $field) {
            $vars['infoRows'][$field['name']] = $field['value'];
        }
        $pdf = self::paper(Pdf::setOption(['isFontSubsettingEnabled' => true]), $companyId)->loadView('pdf.sales', [
            ...$vars,
            'document' => $document,
            'options' => Options::all($companyId),
            'logo' => PdfBrand::logo($companyId),
            'companyName' => Options::get('company_name', $companyId) ?: (string) Company::find($companyId)?->company_name,
        ]);
        PdfBrand::pageNumbers($pdf, Options::all($companyId));
        $name = str_replace(['/', '\\'], '-', $vars['number']).'.pdf';

        return $inline ? $pdf->stream($name) : $pdf->download($name);
    }

    /**
     * @return array{name: string, lines: array<int, string|null>, vat: ?string, pan: ?string}
     */
    private static function customerBlock(Model $document): array
    {
        return [
            'name' => (string) $document->customer?->name,
            'lines' => [
                $document->billing_street,
                collect([$document->billing_city, $document->billing_state])->filter()->implode(', '),
                collect([$document->billing_country, $document->billing_zip])->filter()->implode(' '),
            ],
            'vat' => $document->customer?->vat,
            'pan' => $document->customer?->company_pan,
        ];
    }

    /**
     * @return array<int, string|null>|null
     */
    private static function shipTo(Model $document, bool $show): ?array
    {
        return $show ? [
            $document->shipping_street,
            collect([$document->shipping_city, $document->shipping_state])->filter()->implode(', '),
            collect([$document->shipping_country, $document->shipping_zip])->filter()->implode(' '),
        ] : null;
    }
}
