<?php

namespace App\Services;

use App\Enums\CreditNoteStatus;
use App\Enums\InvoiceStatus;
use App\Models\AppliedCredit;
use App\Models\CreditNote;
use App\Models\CreditNoteRefund;
use App\Models\Customer;
use App\Models\Invoice;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Credit notes as Perfex handles them: credit is applied to the customer's invoices (counting as
 * payment there) or refunded; the note closes when nothing remains.
 */
class CreditNoteService
{
    private const FIELDS = [
        'customer_id', 'project_id', 'currency_id', 'date', 'client_note', 'admin_note', 'terms', 'reference_no',
        'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
        'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country', 'include_shipping', 'show_shipping',
        'show_quantity_as',
    ];

    public function __construct(private InvoiceService $invoices) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): CreditNote
    {
        return DB::transaction(function () use ($data) {
            $note = new CreditNote([
                ...SalesDocuments::withCustomerDefaults(Arr::only($data, self::FIELDS), Customer::findOrFail($data['customer_id'])),
                'status' => CreditNoteStatus::Open,
                'number' => Options::takeNextNumber('next_credit_note_number'),
                'prefix' => Options::get('credit_note_prefix'),
                'number_format' => (int) Options::get('credit_note_number_format'),
                'created_by' => Auth::id(),
            ]);
            $note->save();
            SalesItemsWriter::write($note, $data['items'], $data);

            return $note;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(CreditNote $note, array $data): CreditNote
    {
        return DB::transaction(function () use ($note, $data) {
            $note->update(SalesDocuments::withCustomerDefaults(Arr::only($data, self::FIELDS), $note->customer));
            SalesItemsWriter::write($note, $data['items'], $data);

            if (round((float) $note->total, 2) < round((float) $note->appliedCredits()->sum('amount') + (float) $note->refunds()->sum('amount'), 2)) {
                throw ValidationException::withMessages(['items' => 'The total cannot be less than the credits already applied and refunded.']);
            }
            $this->refreshStatus($note);

            return $note;
        });
    }

    /**
     * Invoices of the same customer that can still take credit (Perfex "Apply to invoice").
     *
     * @return Collection<int, Invoice>
     */
    public function creditableInvoices(CreditNote $note)
    {
        return Invoice::where('customer_id', $note->customer_id)
            ->whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid, InvoiceStatus::Overdue])
            ->with(['payments', 'appliedCredits'])
            ->orderBy('date')
            ->get()
            ->filter(fn (Invoice $invoice) => $invoice->amountDue() > 0)
            ->values();
    }

    public function applyToInvoice(CreditNote $note, Invoice $invoice, float $amount): AppliedCredit
    {
        if ($note->status !== CreditNoteStatus::Open) {
            throw ValidationException::withMessages(['amount' => 'Only open credit notes can be applied.']);
        }
        if ((int) $invoice->customer_id !== (int) $note->customer_id) {
            throw ValidationException::withMessages(['invoice_id' => 'The invoice belongs to another customer.']);
        }
        if (in_array($invoice->status, [InvoiceStatus::Draft, InvoiceStatus::Cancelled, InvoiceStatus::Paid], true)) {
            throw ValidationException::withMessages(['invoice_id' => 'This invoice cannot take credit.']);
        }

        $amount = round($amount, 2);
        $due = $invoice->load(['payments', 'appliedCredits'])->amountDue();
        if ($amount <= 0 || $amount > $note->remainingCredits() || $amount > $due) {
            throw ValidationException::withMessages(['amount' => 'The amount must be more than 0 and at most the remaining credit and the invoice amount due.']);
        }

        return DB::transaction(function () use ($note, $invoice, $amount) {
            $credit = $note->appliedCredits()->create([
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'date' => today(),
                'created_by' => Auth::id(),
            ]);
            $this->refreshStatus($note);
            $this->invoices->refreshStatus($invoice);

            return $credit;
        });
    }

    public function deleteAppliedCredit(AppliedCredit $credit): void
    {
        DB::transaction(function () use ($credit) {
            $note = $credit->creditNote;
            $invoice = $credit->invoice;
            $credit->delete();
            $this->refreshStatus($note);
            $this->invoices->refreshStatus($invoice);
        });
    }

    /**
     * @param  array{amount: float|int|string, refunded_on: string, payment_mode_id?: int|null, note?: string|null}  $data
     */
    public function refund(CreditNote $note, array $data): CreditNoteRefund
    {
        if ($note->status !== CreditNoteStatus::Open || round((float) $data['amount'], 2) > $note->remainingCredits()) {
            throw ValidationException::withMessages(['amount' => 'The refund cannot be more than the remaining credit.']);
        }

        $refund = $note->refunds()->create([...$data, 'created_by' => Auth::id()]);
        $this->refreshStatus($note);

        return $refund;
    }

    public function deleteRefund(CreditNoteRefund $refund): void
    {
        $note = CreditNote::find($refund->credit_note_id);
        $refund->delete();
        $this->refreshStatus($note);
    }

    public function void(CreditNote $note): void
    {
        if ($note->appliedCredits()->exists() || $note->refunds()->exists()) {
            throw ValidationException::withMessages(['status' => 'Remove the applied credits and refunds before voiding.']);
        }
        $note->update(['status' => CreditNoteStatus::Void]);
    }

    public function unvoid(CreditNote $note): void
    {
        $note->update(['status' => CreditNoteStatus::Open]);
        $this->refreshStatus($note);
    }

    /**
     * Perfex update_credit_note_status(): closed once everything is applied or refunded.
     */
    public function refreshStatus(CreditNote $note): void
    {
        if ($note->status === CreditNoteStatus::Void) {
            return;
        }

        $note->update(['status' => $note->remainingCredits() <= 0 && (float) $note->total > 0 ? CreditNoteStatus::Closed : CreditNoteStatus::Open]);
    }
}
