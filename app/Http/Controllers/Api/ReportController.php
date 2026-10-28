<?php

namespace App\Http\Controllers\Api;

use App\Enums\CreditNoteStatus;
use App\Enums\EstimateStatus;
use App\Enums\InvoiceStatus;
use App\Enums\ProposalStatus;
use App\Http\Controllers\Controller;
use App\Models\CreditNote;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Models\KbArticle;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\Payment;
use App\Models\Proposal;
use App\Models\SalesItem;
use App\Models\TaskTimer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * Perfex Reports: sales (invoices, items, payments, customers, credit notes, proposals, estimates
 * + income charts), expenses, expenses vs income, leads, timesheets and knowledge base.
 * Needs the "reports" permission (admins have it).
 */
class ReportController extends Controller
{
    private const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /**
     * Sales report tables for a period.
     */
    public function sales(Request $request): JsonResponse
    {
        $this->allow($request);
        $data = $request->validate([
            'type' => ['required', Rule::in(['invoices', 'items', 'payments', 'customers', 'credit_notes', 'proposals', 'estimates'])],
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'status' => ['nullable', 'integer'],
            'sale_agent_id' => ['nullable', 'integer'],
        ]);
        [$from, $to] = [$data['from'], $data['to']];
        $status = $data['status'] ?? null;
        $agent = $data['sale_agent_id'] ?? null;

        $rows = match ($data['type']) {
            'invoices' => Invoice::whereBetween('date', [$from, $to])->where('status', '!=', InvoiceStatus::Draft)
                ->when($status, fn ($q) => $q->where('status', $status))->when($agent, fn ($q) => $q->where('sale_agent_id', $agent))
                ->with('customer:id,name')->withSum('payments', 'amount')->withSum('appliedCredits', 'amount')->orderBy('date')->get()
                ->map(fn (Invoice $i) => [
                    'id' => $i->id, 'number' => $i->formattedNumber(), 'customer' => $i->customer?->name, 'date' => $i->date->toDateString(),
                    'due_date' => $i->due_date?->toDateString(), 'subtotal' => (float) $i->subtotal, 'total_tax' => (float) $i->total_tax,
                    'discount' => (float) $i->discount_total, 'adjustment' => (float) $i->adjustment, 'total' => (float) $i->total,
                    'paid' => (float) $i->payments_sum_amount, 'credits' => (float) $i->applied_credits_sum_amount,
                    'due' => round((float) $i->total - (float) $i->payments_sum_amount - (float) $i->applied_credits_sum_amount, 2),
                    'status' => $i->status->label(),
                ]),
            'items' => SalesItem::where('documentable_type', Invoice::class)
                ->whereIn('documentable_id', Invoice::whereBetween('date', [$from, $to])->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])
                    ->when($agent, fn ($q) => $q->where('sale_agent_id', $agent))->select('id'))
                ->selectRaw('description, SUM(qty) as quantity, SUM(qty * rate) as amount, AVG(rate) as average_price')
                ->groupBy('description')->orderByDesc('amount')->get()
                ->map(fn ($r) => ['item' => $r->description, 'quantity_sold' => (float) $r->quantity, 'total_amount' => round((float) $r->amount, 2), 'average_price' => round((float) $r->average_price, 2)]),
            'payments' => Payment::whereBetween('date', [$from, $to])->whereHas('invoice')
                ->with(['invoice.customer:id,name', 'paymentMode'])->orderBy('date')->get()
                ->map(fn (Payment $p) => [
                    'id' => $p->id, 'date' => $p->date->toDateString(), 'invoice' => $p->invoice->formattedNumber(), 'customer' => $p->invoice->customer?->name,
                    'payment_mode' => $p->paymentMode?->name, 'transaction_id' => $p->transaction_id, 'amount' => (float) $p->amount,
                ]),
            'customers' => Customer::query()
                ->withCount(['invoices as invoices_count' => fn ($q) => $q->whereBetween('date', [$from, $to])->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])])
                ->withSum(['invoices as total_amount' => fn ($q) => $q->whereBetween('date', [$from, $to])->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])], 'total')
                ->withSum(['invoices as total_tax' => fn ($q) => $q->whereBetween('date', [$from, $to])->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])], 'total_tax')
                ->having('invoices_count', '>', 0)->orderByDesc('total_amount')->get()
                ->map(fn (Customer $c) => ['customer' => $c->name, 'invoices' => (int) $c->invoices_count, 'total_tax' => round((float) $c->total_tax, 2), 'total_amount' => round((float) $c->total_amount, 2)]),
            'credit_notes' => CreditNote::whereBetween('date', [$from, $to])->when($status, fn ($q) => $q->where('status', $status))
                ->with('customer:id,name')->orderBy('date')->get()
                ->map(fn (CreditNote $n) => [
                    'id' => $n->id, 'number' => $n->formattedNumber(), 'customer' => $n->customer?->name, 'date' => $n->date->toDateString(),
                    'subtotal' => (float) $n->subtotal, 'total_tax' => (float) $n->total_tax, 'total' => (float) $n->total,
                    'remaining' => $n->remainingCredits(), 'status' => $n->status->label(),
                ]),
            'proposals' => Proposal::whereBetween('date', [$from, $to])->when($status, fn ($q) => $q->where('status', $status))
                ->when($agent, fn ($q) => $q->where('assigned_id', $agent))->orderBy('date')->get()
                ->map(fn (Proposal $p) => [
                    'id' => $p->id, 'number' => $p->formattedNumber(), 'subject' => $p->subject, 'to' => $p->proposal_to, 'date' => $p->date->toDateString(),
                    'open_till' => $p->open_till?->toDateString(), 'subtotal' => (float) $p->subtotal, 'total_tax' => (float) $p->total_tax,
                    'total' => (float) $p->total, 'status' => $p->status->label(),
                ]),
            'estimates' => Estimate::whereBetween('date', [$from, $to])->when($status, fn ($q) => $q->where('status', $status))
                ->when($agent, fn ($q) => $q->where('sale_agent_id', $agent))->with(['customer:id,name', 'invoice'])->orderBy('date')->get()
                ->map(fn (Estimate $e) => [
                    'id' => $e->id, 'number' => $e->formattedNumber(), 'customer' => $e->customer?->name, 'date' => $e->date->toDateString(),
                    'expiry_date' => $e->expiry_date?->toDateString(), 'subtotal' => (float) $e->subtotal, 'total_tax' => (float) $e->total_tax,
                    'total' => (float) $e->total, 'invoiced' => $e->invoice?->formattedNumber(), 'status' => $e->status->label(),
                ]),
        };

        return response()->json(['data' => $rows->values(), 'meta' => ['statuses' => $this->statusOptions($data['type'])]]);
    }

    /**
     * Sales charts for a year: total income per month, income per payment mode per month,
     * and income by customer group.
     */
    public function salesCharts(Request $request): JsonResponse
    {
        $this->allow($request);
        $year = $this->year($request);
        $payments = Payment::whereYear('date', $year)->whereHas('invoice')->with(['paymentMode', 'invoice.customer.groups'])->get();

        $byMonth = $this->monthly($payments, fn (Payment $p) => $p->date->month, fn ($group) => $group->sum('amount'));
        $modes = $payments->groupBy(fn (Payment $p) => $p->paymentMode?->name ?? 'Not specified')
            ->map(fn ($rows) => $this->monthly($rows, fn (Payment $p) => $p->date->month, fn ($group) => $group->sum('amount')));
        $groups = $payments->flatMap(fn (Payment $p) => ($p->invoice->customer?->groups->pluck('name') ?? collect())->whenEmpty(fn ($c) => $c->push('No group'))->map(fn ($g) => [$g, (float) $p->amount]))
            ->groupBy(0)->map(fn ($rows) => round($rows->sum(1), 2));

        return response()->json(['data' => [
            'months' => self::MONTHS,
            'total_income' => $byMonth,
            'payment_modes' => $modes,
            'customer_groups' => $groups,
        ]]);
    }

    /**
     * Expenses per category per month for a year (Perfex Expenses report).
     */
    public function expenses(Request $request): JsonResponse
    {
        $this->allow($request);
        $year = $this->year($request);
        $expenses = Expense::whereYear('date', $year)->when($request->boolean('exclude_billable'), fn ($q) => $q->where('billable', false))->with(['tax', 'tax2'])->get();
        $categories = ExpenseCategory::orderBy('name')->get(['id', 'name']);

        $rows = $categories->map(fn ($c) => [
            'category' => $c->name,
            'months' => $this->monthly($expenses->where('expense_category_id', $c->id), fn (Expense $e) => $e->date->month, fn ($g) => $g->sum(fn (Expense $e) => $e->totalWithTax())),
        ])->filter(fn ($r) => array_sum($r['months']) > 0)->values();

        return response()->json(['data' => [
            'months' => self::MONTHS,
            'categories' => $rows,
            'totals' => $this->monthly($expenses, fn (Expense $e) => $e->date->month, fn ($g) => $g->sum(fn (Expense $e) => $e->totalWithTax())),
        ]]);
    }

    public function expensesVsIncome(Request $request): JsonResponse
    {
        $this->allow($request);
        $year = $this->year($request);

        return response()->json(['data' => [
            'months' => self::MONTHS,
            'income' => $this->monthly(Payment::whereYear('date', $year)->whereHas('invoice')->get(), fn ($p) => $p->date->month, fn ($g) => $g->sum('amount')),
            'expenses' => $this->monthly(Expense::whereYear('date', $year)->with(['tax', 'tax2'])->get(), fn ($e) => $e->date->month, fn ($g) => $g->sum(fn (Expense $e) => $e->totalWithTax())),
        ]]);
    }

    /**
     * Leads: new and converted per month, conversions by source.
     */
    public function leads(Request $request): JsonResponse
    {
        $this->allow($request);
        $year = $this->year($request);
        $leads = Lead::whereYear('created_at', $year)->get(['id', 'lead_source_id', 'customer_id', 'created_at', 'converted_at']);
        $converted = Lead::whereYear('converted_at', $year)->whereNotNull('customer_id')->get(['id', 'converted_at']);

        return response()->json(['data' => [
            'months' => self::MONTHS,
            'new' => $this->monthly($leads, fn ($l) => $l->created_at->month, fn ($g) => $g->count()),
            'converted' => $this->monthly($converted, fn ($l) => $l->converted_at->month, fn ($g) => $g->count()),
            'sources' => LeadSource::orderBy('name')->get()->map(fn ($s) => [
                'source' => $s->name,
                'leads' => $leads->where('lead_source_id', $s->id)->count(),
                'converted' => $leads->where('lead_source_id', $s->id)->whereNotNull('customer_id')->count(),
            ])->filter(fn ($r) => $r['leads'] > 0)->values(),
            'this_week_converted' => Lead::whereNotNull('customer_id')->where('converted_at', '>=', now()->startOfWeek())->count(),
        ]]);
    }

    /**
     * Timesheets overview: logged time per staff member in a period.
     */
    public function timesheets(Request $request): JsonResponse
    {
        $this->allow($request);
        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date', 'after_or_equal:from']]);

        $timers = TaskTimer::whereHas('task')->whereBetween('start_time', [$data['from'], $data['to'].' 23:59:59'])->with('task:id,billable')->get();
        $names = User::whereIn('id', $timers->pluck('user_id')->unique())->pluck('full_name', 'id');

        return response()->json(['data' => $timers->groupBy('user_id')->map(fn ($rows, $userId) => [
            'staff' => $names[$userId] ?? "#{$userId}",
            'total_seconds' => $rows->sum(fn ($t) => $t->roundedSeconds()),
            'billable_seconds' => $rows->filter(fn ($t) => $t->task?->billable)->sum(fn ($t) => $t->roundedSeconds()),
            'entries' => $rows->count(),
        ])->sortByDesc('total_seconds')->values()]);
    }

    public function knowledgeBase(Request $request): JsonResponse
    {
        $this->allow($request);

        return response()->json(['data' => KbArticle::with('group:id,name')
            ->withCount(['feedback as helpful' => fn ($q) => $q->where('helpful', true), 'feedback as not_helpful' => fn ($q) => $q->where('helpful', false)])
            ->orderByDesc('views')->get()
            ->map(fn ($a) => ['article' => $a->subject, 'group' => $a->group?->name, 'views' => $a->views, 'helpful' => $a->helpful, 'not_helpful' => $a->not_helpful])]);
    }

    /**
     * @param  Collection<int, mixed>  $rows
     * @return array<int, float>
     */
    private function monthly(Collection $rows, callable $month, callable $sum): array
    {
        $grouped = $rows->groupBy($month);

        return array_map(fn (int $m) => round((float) (isset($grouped[$m]) ? $sum($grouped[$m]) : 0), 2), range(1, 12));
    }

    private function year(Request $request): int
    {
        $request->validate(['year' => ['nullable', 'integer', 'between:2000,2100']]);

        return $request->integer('year') ?: (int) date('Y');
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function statusOptions(string $type): array
    {
        $enum = match ($type) {
            'invoices' => InvoiceStatus::class,
            'estimates' => EstimateStatus::class,
            'proposals' => ProposalStatus::class,
            'credit_notes' => CreditNoteStatus::class,
            default => null,
        };

        return $enum ? array_map(fn ($c) => ['id' => $c->value, 'name' => $c->label()], $enum::cases()) : [];
    }

    private function allow(Request $request): void
    {
        abort_unless($request->user()->hasPermission('reports', 'view'), 403);
    }
}
