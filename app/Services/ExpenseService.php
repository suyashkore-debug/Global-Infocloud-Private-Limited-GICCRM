<?php

namespace App\Services;

use App\Models\Currency;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\PaymentMode;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Expenses as Perfex handles them: billable expenses of a customer can become an invoice, and
 * recurring expenses repeat on schedule.
 */
class ExpenseService
{
    private const FIELDS = [
        'expense_category_id', 'name', 'amount', 'currency_id', 'tax_id', 'tax2_id', 'date', 'customer_id', 'project_id',
        'billable', 'payment_mode_id', 'reference_no', 'note', 'repeat_every', 'recurring_type', 'cycles', 'create_invoice_billable',
    ];

    public function __construct(private InvoiceService $invoices) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Expense
    {
        return Expense::create([...$this->fields($data), 'created_by' => Auth::id()]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Expense $expense, array $data): Expense
    {
        $expense->update($this->fields($data));

        return $expense;
    }

    /**
     * Perfex expenses convert_to_invoice(): one line "category - name" at the expense amount with
     * its taxes; the expense is then linked to the invoice.
     */
    public function convertToInvoice(Expense $expense, bool $asDraft = false): Invoice
    {
        if (! $expense->billable || ! $expense->customer_id) {
            throw ValidationException::withMessages(['expense' => 'Only billable expenses of a customer can be invoiced.']);
        }
        if ($expense->invoice_id) {
            throw ValidationException::withMessages(['expense' => 'This expense is already invoiced.']);
        }

        return DB::transaction(function () use ($expense, $asDraft) {
            $expense->loadMissing(['category', 'tax', 'tax2']);
            $today = today()->toDateString();
            $invoice = $this->invoices->create([
                'customer_id' => $expense->customer_id,
                'project_id' => $expense->project_id,
                'currency_id' => $expense->currency_id,
                'date' => $today,
                'due_date' => $this->invoices->defaultDueDate($today),
                'terms' => Options::get('predefined_terms_invoice'),
                'client_note' => Options::get('predefined_clientnote_invoice'),
                'allowed_payment_modes' => PaymentMode::where('active', true)->where('expenses_only', false)->where('selected_by_default', true)->pluck('id')->all(),
                'items' => [[
                    'description' => trim($expense->category->name.($expense->name ? ' - '.$expense->name : '')),
                    'long_description' => $expense->note,
                    'qty' => 1,
                    'rate' => $expense->amount,
                    'taxes' => collect([$expense->tax, $expense->tax2])->filter()->map(fn ($t) => ['tax_name' => $t->name, 'tax_rate' => $t->rate])->values()->all(),
                ]],
                'save_as_draft' => $asDraft,
            ]);
            $expense->update(['invoice_id' => $invoice->id]);

            return $invoice;
        });
    }

    public function copy(Expense $source): Expense
    {
        return $this->create([...$source->only(self::FIELDS), 'date' => today()->toDateString()]);
    }

    /**
     * Daily: recurring expenses whose next date has come get a copy for that date.
     */
    public function createRecurring(): int
    {
        $created = 0;
        Expense::withoutGlobalScopes()
            ->whereNotNull('repeat_every')
            ->where(fn ($q) => $q->where('cycles', 0)->orWhereColumn('total_cycles', '<', 'cycles'))
            ->each(function (Expense $expense) use (&$created) {
                $from = CarbonImmutable::parse($expense->last_recurring_date ?? $expense->date);
                $next = match ($expense->recurring_type) {
                    'day' => $from->addDays($expense->repeat_every),
                    'week' => $from->addWeeks($expense->repeat_every),
                    'year' => $from->addYearsNoOverflow($expense->repeat_every),
                    default => $from->addMonthsNoOverflow($expense->repeat_every),
                };
                if ($next->isAfter(today())) {
                    return;
                }

                $copy = $expense->replicate(['repeat_every', 'recurring_type', 'cycles', 'total_cycles', 'last_recurring_date', 'invoice_id']);
                $copy->fill(['date' => $next, 'recurring_from_id' => $expense->id])->save();
                $expense->update(['last_recurring_date' => $next, 'total_cycles' => $expense->total_cycles + 1]);
                $created++;
            });

        return $created;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function fields(array $data): array
    {
        $fields = Arr::only($data, self::FIELDS);
        $fields['currency_id'] ??= Currency::default()->id;
        if (empty($fields['repeat_every'])) {
            $fields['repeat_every'] = null;
            $fields['recurring_type'] = null;
        }
        if (empty($fields['customer_id'])) {
            $fields['billable'] = false;
            $fields['project_id'] = null;
        }

        return $fields;
    }
}
