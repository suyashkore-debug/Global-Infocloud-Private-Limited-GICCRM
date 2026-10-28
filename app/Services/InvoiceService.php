<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Invoice actions as Perfex does them: numbering (drafts get their number when they stop being
 * drafts), status from payments and due date, cancel / uncancel, payments, recurring copies.
 */
class InvoiceService
{
    private const FIELDS = [
        'customer_id', 'project_id', 'currency_id', 'date', 'due_date', 'show_quantity_as', 'client_note', 'admin_note',
        'terms', 'sale_agent_id', 'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
        'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country', 'include_shipping',
        'show_shipping_on_invoice', 'allowed_payment_modes', 'repeat_every', 'recurring_type', 'cycles', 'cancel_overdue_reminders',
    ];

    /**
     * @param  array<string, mixed>  $data  validated fields plus items[], tags[] and save_as_draft
     */
    public function create(array $data): Invoice
    {
        return DB::transaction(function () use ($data) {
            $draft = ! empty($data['save_as_draft']);
            $customer = Customer::findOrFail($data['customer_id']);

            $invoice = new Invoice([
                ...$this->fields($data, $customer),
                'number' => $draft ? 0 : Options::takeNextNumber('next_invoice_number'),
                'prefix' => Options::get('invoice_prefix'),
                'number_format' => (int) Options::get('invoice_number_format'),
                'status' => $draft ? InvoiceStatus::Draft : InvoiceStatus::Unpaid,
                'hash' => Str::random(32),
                'created_by' => Auth::id(),
            ]);
            $invoice->save();

            SalesItemsWriter::write($invoice, $data['items'], $data);
            $invoice->syncTagNames($data['tags'] ?? []);

            if (! $draft) {
                $this->refreshStatus($invoice);
            }

            return $invoice;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Invoice $invoice, array $data): Invoice
    {
        return DB::transaction(function () use ($invoice, $data) {
            $invoice->fill($this->fields($data, $invoice->customer));
            $invoice->save();

            SalesItemsWriter::write($invoice, $data['items'], $data);
            if (array_key_exists('tags', $data)) {
                $invoice->syncTagNames($data['tags'] ?? []);
            }

            if ($invoice->status === InvoiceStatus::Draft && array_key_exists('save_as_draft', $data) && ! $data['save_as_draft']) {
                $this->publishDraft($invoice);
            } else {
                $this->refreshStatus($invoice);
            }

            return $invoice;
        });
    }

    /**
     * A draft becomes a real invoice: it takes the next number and its status from payments / due date.
     */
    public function publishDraft(Invoice $invoice): void
    {
        if ($invoice->status !== InvoiceStatus::Draft) {
            return;
        }

        $invoice->update([
            'number' => Options::takeNextNumber('next_invoice_number'),
            'prefix' => Options::get('invoice_prefix'),
            'number_format' => (int) Options::get('invoice_number_format'),
            'status' => InvoiceStatus::Unpaid,
        ]);
        $this->refreshStatus($invoice, force: true);
    }

    /**
     * Perfex update_invoice_status(): paid / partially paid / unpaid / overdue from the payments and
     * the due date. Drafts and cancelled invoices keep their status unless forced.
     */
    public function refreshStatus(Invoice $invoice, bool $force = false): InvoiceStatus
    {
        $invoice->refresh();
        if (! $force && in_array($invoice->status, [InvoiceStatus::Draft, InvoiceStatus::Cancelled], true)) {
            return $invoice->status;
        }

        $paid = round((float) $invoice->payments()->sum('amount') + (float) $invoice->appliedCredits()->sum('amount'), 2);
        $total = round((float) $invoice->total, 2);
        $overdue = $invoice->due_date && $invoice->due_date->lt(today());

        $status = match (true) {
            $total <= 0 && $paid == 0.0 => InvoiceStatus::Paid,
            $paid >= $total && $paid > 0 => InvoiceStatus::Paid,
            $paid > 0 => InvoiceStatus::PartiallyPaid,
            $overdue => InvoiceStatus::Overdue,
            default => InvoiceStatus::Unpaid,
        };

        if ($status !== $invoice->status) {
            $invoice->update(['status' => $status]);
        }

        return $status;
    }

    public function cancel(Invoice $invoice): void
    {
        $invoice->update(['status' => InvoiceStatus::Cancelled]);
    }

    public function uncancel(Invoice $invoice): void
    {
        $invoice->update(['status' => InvoiceStatus::Unpaid]);
        $this->refreshStatus($invoice, force: true);
    }

    /**
     * @param  array{amount: float|int|string, date: string, payment_mode_id?: int|null, payment_method?: string|null, transaction_id?: string|null, note?: string|null}  $data
     */
    public function recordPayment(Invoice $invoice, array $data): Payment
    {
        if (in_array($invoice->status, [InvoiceStatus::Draft, InvoiceStatus::Cancelled], true)) {
            throw ValidationException::withMessages(['amount' => 'Payments cannot be recorded on a draft or cancelled invoice.']);
        }

        $due = $invoice->load(['payments', 'appliedCredits'])->amountDue();
        if (round((float) $data['amount'], 2) > $due) {
            throw ValidationException::withMessages(['amount' => 'The amount is more than the amount due ('.number_format($due, 2).').']);
        }

        return DB::transaction(function () use ($invoice, $data) {
            $payment = $invoice->payments()->create([
                ...Arr::only($data, ['amount', 'date', 'payment_mode_id', 'payment_method', 'transaction_id', 'note']),
                'company_id' => $invoice->company_id,
                'created_by' => Auth::id(),
            ]);
            $this->refreshStatus($invoice);

            return $payment;
        });
    }

    public function deletePayment(Payment $payment): void
    {
        $invoice = $payment->invoice;
        $payment->delete();
        $this->refreshStatus($invoice);
    }

    public function markSent(Invoice $invoice): void
    {
        $invoice->update(['sent' => true, 'sent_at' => now()]);
    }

    /**
     * Copy an invoice (Perfex "Copy"): a new unpaid invoice dated today with the same lines.
     */
    public function copy(Invoice $source): Invoice
    {
        $source->load('items.taxes', 'tags');

        return $this->create([
            ...$source->only(self::FIELDS),
            'date' => today()->toDateString(),
            'due_date' => $this->defaultDueDate(today()->toDateString()),
            'allowed_payment_modes' => $source->allowed_payment_modes,
            'discount_type' => $source->discount_type,
            'discount_percent' => $source->discount_percent,
            'discount_total' => $source->discount_total,
            'adjustment' => $source->adjustment,
            'items' => $this->itemsOf($source),
            'tags' => $source->tags->pluck('name')->all(),
        ]);
    }

    /**
     * Daily: unpaid invoices past their due date become overdue (Perfex cron).
     */
    public function markOverdue(): int
    {
        $count = 0;
        Invoice::withoutGlobalScopes()
            ->whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid])
            ->whereDate('due_date', '<', today())
            ->each(function (Invoice $invoice) use (&$count) {
                $wasOverdue = $invoice->status === InvoiceStatus::Overdue;
                if ($this->refreshStatus($invoice) === InvoiceStatus::Overdue) {
                    $count++;
                    if (! $wasOverdue) {
                        $this->sendOverdueNotice($invoice);
                    }
                }
            });

        return $count;
    }

    /**
     * Perfex "Invoice Overdue Notice" to the customer's contacts, once, when an invoice becomes
     * overdue (the template is off by default; turn it on in Setup → Email Templates).
     */
    private function sendOverdueNotice(Invoice $invoice): void
    {
        $invoice->load(['customer', 'currency']);
        foreach ($invoice->customer?->contacts()->where('active', true)->where('invoice_emails', true)->get() ?? [] as $contact) {
            Emails::send('invoice-overdue-notice', (int) $invoice->company_id, (string) $contact->email, [...Emails::invoice($invoice), ...Emails::contact($contact)], ['rel' => $invoice]);
        }
    }

    /**
     * Daily: create the next copy of recurring invoices whose date has come (Perfex recurring invoices).
     */
    public function createRecurring(): int
    {
        $created = 0;
        Invoice::withoutGlobalScopes()
            ->whereNotNull('repeat_every')
            ->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])
            ->where(fn ($q) => $q->where('cycles', 0)->orWhereColumn('total_cycles', '<', 'cycles'))
            ->with('items.taxes')
            ->each(function (Invoice $invoice) use (&$created) {
                $from = CarbonImmutable::parse($invoice->last_recurring_date ?? $invoice->date);
                $next = match ($invoice->recurring_type) {
                    'day' => $from->addDays($invoice->repeat_every),
                    'week' => $from->addWeeks($invoice->repeat_every),
                    'year' => $from->addYearsNoOverflow($invoice->repeat_every),
                    default => $from->addMonthsNoOverflow($invoice->repeat_every),
                };
                if ($next->isAfter(today())) {
                    return;
                }

                DB::transaction(function () use ($invoice, $next) {
                    $copy = $invoice->replicate(['number', 'status', 'sent', 'sent_at', 'hash', 'repeat_every', 'recurring_type', 'cycles', 'total_cycles', 'last_recurring_date']);
                    $dueDays = $invoice->due_date ? (int) $invoice->date->diffInDays($invoice->due_date) : null;
                    $copy->fill([
                        'number' => Options::takeNextNumber('next_invoice_number', $invoice->company_id),
                        'date' => $next,
                        'due_date' => $dueDays !== null ? $next->addDays($dueDays) : null,
                        'status' => InvoiceStatus::Unpaid,
                        'hash' => Str::random(32),
                        'recurring_from_id' => $invoice->id,
                    ]);
                    $copy->save();
                    SalesItemsWriter::write($copy, $this->itemsOf($invoice), $invoice->only(['discount_type', 'discount_percent', 'discount_total', 'adjustment']));
                    $invoice->update(['last_recurring_date' => $next, 'total_cycles' => $invoice->total_cycles + 1]);
                });
                $created++;
            });

        return $created;
    }

    public function defaultDueDate(string $date): ?string
    {
        $days = (int) Options::get('invoice_due_after');

        return $days > 0 ? CarbonImmutable::parse($date)->addDays($days)->toDateString() : null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function itemsOf(Invoice $invoice): array
    {
        return SalesDocuments::itemsOf($invoice);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function fields(array $data, Customer $customer): array
    {
        $fields = SalesDocuments::withCustomerDefaults(Arr::only($data, self::FIELDS), $customer);

        if (empty($fields['repeat_every'])) {
            $fields['repeat_every'] = null;
            $fields['recurring_type'] = null;
        }

        return $fields;
    }
}
