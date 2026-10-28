<?php

namespace App\Services;

use App\Enums\EstimateStatus;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\PaymentMode;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Estimates as Perfex handles them: numbered from Setup, sent / accepted / declined / expired,
 * converted into an invoice (which marks the estimate accepted).
 */
class EstimateService
{
    private const FIELDS = [
        'customer_id', 'project_id', 'currency_id', 'date', 'expiry_date', 'status', 'client_note', 'admin_note', 'terms',
        'reference_no', 'sale_agent_id', 'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
        'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country', 'include_shipping', 'show_shipping',
        'show_quantity_as',
    ];

    public function __construct(private InvoiceService $invoices) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Estimate
    {
        return DB::transaction(function () use ($data) {
            $estimate = new Estimate([
                ...SalesDocuments::withCustomerDefaults(Arr::only($data, self::FIELDS), Customer::findOrFail($data['customer_id'])),
                'status' => $data['status'] ?? EstimateStatus::Draft,
                'number' => Options::takeNextNumber('next_estimate_number'),
                'prefix' => Options::get('estimate_prefix'),
                'number_format' => (int) Options::get('estimate_number_format'),
                'hash' => Str::random(32),
                'created_by' => Auth::id(),
            ]);
            $estimate->save();

            SalesItemsWriter::write($estimate, $data['items'], $data);
            $estimate->syncTagNames($data['tags'] ?? []);

            return $estimate;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Estimate $estimate, array $data): Estimate
    {
        return DB::transaction(function () use ($estimate, $data) {
            $estimate->update(SalesDocuments::withCustomerDefaults(Arr::only($data, self::FIELDS), $estimate->customer));
            SalesItemsWriter::write($estimate, $data['items'], $data);
            if (array_key_exists('tags', $data)) {
                $estimate->syncTagNames($data['tags'] ?? []);
            }

            return $estimate;
        });
    }

    public function markStatus(Estimate $estimate, EstimateStatus $status): void
    {
        $estimate->update(['status' => $status]);
    }

    /**
     * "Mark as sent": a draft becomes sent.
     */
    public function markSent(Estimate $estimate): void
    {
        $estimate->update([
            'sent' => true,
            'sent_at' => now(),
            'status' => $estimate->status === EstimateStatus::Draft ? EstimateStatus::Sent : $estimate->status,
        ]);
    }

    /**
     * Perfex convert_to_invoice(): an invoice dated today with the estimate's lines, the invoice
     * defaults (terms, note, payment modes) and the estimate marked accepted.
     */
    public function convertToInvoice(Estimate $estimate, bool $asDraft = false): Invoice
    {
        if ($estimate->invoice_id) {
            throw ValidationException::withMessages(['estimate' => 'This estimate is already invoiced.']);
        }

        return DB::transaction(function () use ($estimate, $asDraft) {
            $today = today()->toDateString();
            $invoice = $this->invoices->create([
                ...$estimate->only([
                    'customer_id', 'project_id', 'currency_id', 'sale_agent_id', 'include_shipping',
                    'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
                    'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country',
                ]),
                ...SalesDocuments::moneyOf($estimate),
                'show_shipping_on_invoice' => $estimate->show_shipping,
                'date' => $today,
                'due_date' => $this->invoices->defaultDueDate($today),
                'terms' => Options::get('predefined_terms_invoice'),
                'client_note' => Options::get('predefined_clientnote_invoice'),
                'allowed_payment_modes' => PaymentMode::where('active', true)->where('expenses_only', false)->where('selected_by_default', true)->pluck('id')->all(),
                'items' => SalesDocuments::itemsOf($estimate),
                'tags' => $estimate->tags()->pluck('name')->all(),
                'save_as_draft' => $asDraft,
            ]);

            $estimate->update(['invoice_id' => $invoice->id, 'invoiced_at' => now(), 'status' => EstimateStatus::Accepted]);

            return $invoice;
        });
    }

    public function copy(Estimate $source): Estimate
    {
        $date = today()->toDateString();

        return $this->create([
            ...$source->only(self::FIELDS),
            ...SalesDocuments::moneyOf($source),
            'date' => $date,
            'expiry_date' => $this->defaultExpiryDate($date),
            'status' => EstimateStatus::Draft,
            'items' => SalesDocuments::itemsOf($source),
            'tags' => $source->tags()->pluck('name')->all(),
        ]);
    }

    public function defaultExpiryDate(string $date): ?string
    {
        $days = (int) Options::get('estimate_due_after');

        return $days > 0 ? CarbonImmutable::parse($date)->addDays($days)->toDateString() : null;
    }

    /**
     * Daily: sent estimates past their expiry date become expired (Perfex cron).
     */
    public function markExpired(): int
    {
        return Estimate::withoutGlobalScopes()
            ->where('status', EstimateStatus::Sent)
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<', today())
            ->update(['status' => EstimateStatus::Expired]);
    }
}
