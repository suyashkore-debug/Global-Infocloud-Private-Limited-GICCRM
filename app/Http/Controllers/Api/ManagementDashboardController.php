<?php

namespace App\Http\Controllers\Api;

use App\Enums\InvoiceStatus;
use App\Enums\ProjectStatus;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Payment;
use App\Models\Project;
use App\Models\TaskTimer;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * Reports → Management dashboard: the company's money, customers, sales people, projects, team
 * time, leads and support for a period, for people with the Reports permission. Dates are India
 * time; months run on the calendar, the financial year April → March.
 */
class ManagementDashboardController extends Controller
{
    private const TZ = 'Asia/Kolkata';

    public function __invoke(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reports', 'view'), 403);
        $period = $request->validate(['period' => ['nullable', Rule::in(['month', 'quarter', 'fy', 'year'])]])['period'] ?? 'year';
        [$from, $to] = $this->range($period);
        $months = $this->months($from, $to);
        $key = fn ($date) => Carbon::parse($date)->format('Y-m');

        $payments = Payment::whereBetween('date', [$from->toDateString(), $to->toDateString()])->whereHas('invoice')->with('invoice:id,customer_id,date', 'invoice.customer:id,name')->get();
        $expenses = Expense::whereBetween('date', [$from->toDateString(), $to->toDateString()])->with(['tax', 'tax2', 'category:id,name'])->get();
        $invoices = Invoice::whereBetween('date', [$from->toDateString(), $to->toDateString()])->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])->with('saleAgent:id,full_name')->get();
        $open = Invoice::whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid, InvoiceStatus::Overdue])->with(['payments', 'appliedCredits'])->get();

        $received = (float) $payments->sum('amount');
        $spent = (float) $expenses->sum(fn (Expense $e) => $e->totalWithTax());
        $paidDays = $payments->map(fn (Payment $p) => $p->invoice?->date ? $p->invoice->date->diffInDays($p->date, false) : null)->filter(fn ($d) => $d !== null && $d >= 0);

        return response()->json(['data' => [
            'period' => ['key' => $period, 'from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'invoiced' => round((float) $invoices->sum('total'), 2),
                'received' => round($received, 2),
                'expenses' => round($spent, 2),
                'net' => round($received - $spent, 2),
                'outstanding' => round($open->sum(fn (Invoice $i) => $i->amountDue()), 2),
                'avg_days_to_pay' => $paidDays->isNotEmpty() ? (int) round($paidDays->avg()) : null,
            ],
            'cash' => [
                'months' => $months->map(fn (Carbon $m) => $m->format('M y'))->values(),
                'income' => $this->perMonth($months, $payments->groupBy(fn ($p) => $key($p->date))->map->sum('amount')),
                'expenses' => $this->perMonth($months, $expenses->groupBy(fn ($e) => $key($e->date))->map(fn ($g) => $g->sum(fn (Expense $e) => $e->totalWithTax()))),
            ],
            'aging' => $this->aging($open),
            'top_customers' => $this->top($payments->groupBy(fn (Payment $p) => $p->invoice?->customer?->name ?? 'Unknown')->map->sum('amount')),
            'sales_by_agent' => $this->top($invoices->groupBy(fn (Invoice $i) => $i->saleAgent?->full_name ?? 'No sale agent')->map->sum('total')),
            'expense_categories' => $this->top($expenses->groupBy(fn (Expense $e) => $e->category?->name ?? 'Uncategorised')->map(fn ($g) => $g->sum(fn (Expense $e) => $e->totalWithTax()))),
            'team' => $this->team($from, $to),
            'projects' => $this->projects(),
            'leads' => $this->leads($months, $from, $to, $key),
            'tickets' => $this->tickets($from, $to),
        ]]);
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function range(string $period): array
    {
        $today = Carbon::today(self::TZ);

        return match ($period) {
            'month' => [$today->copy()->startOfMonth(), $today],
            'quarter' => [$today->copy()->startOfMonth()->subMonths(2), $today],
            // Indian financial year: 1 April → 31 March.
            'fy' => [Carbon::create($today->month >= 4 ? $today->year : $today->year - 1, 4, 1, 0, 0, 0, self::TZ), $today],
            default => [$today->copy()->startOfMonth()->subMonths(11), $today],
        };
    }

    /** @return Collection<int, Carbon> */
    private function months(Carbon $from, Carbon $to): Collection
    {
        $months = collect();
        for ($m = $from->copy()->startOfMonth(); $m->lte($to); $m->addMonth()) {
            $months->push($m->copy());
        }

        return $months;
    }

    /**
     * @param  Collection<int, Carbon>  $months
     * @param  Collection<string, mixed>  $totals
     * @return array<int, float>
     */
    private function perMonth(Collection $months, Collection $totals): array
    {
        return $months->map(fn (Carbon $m) => round((float) ($totals[$m->format('Y-m')] ?? 0), 2))->values()->all();
    }

    /**
     * Unpaid money by how late it is (days past the due date).
     *
     * @param  Collection<int, Invoice>  $open
     * @return array<int, array{label: string, amount: float, count: int}>
     */
    private function aging(Collection $open): array
    {
        $today = Carbon::today(self::TZ)->toDateString();
        $buckets = ['Not due yet' => [], '1–30 days late' => [], '31–60 days late' => [], '61–90 days late' => [], 'Over 90 days late' => []];
        foreach ($open as $invoice) {
            $late = $invoice->due_date && $invoice->due_date->toDateString() < $today ? (int) $invoice->due_date->diffInDays(Carbon::parse($today), true) : 0;
            $label = match (true) {
                $late <= 0 => 'Not due yet',
                $late <= 30 => '1–30 days late',
                $late <= 60 => '31–60 days late',
                $late <= 90 => '61–90 days late',
                default => 'Over 90 days late',
            };
            $buckets[$label][] = $invoice->amountDue();
        }

        return collect($buckets)->map(fn ($amounts, $label) => ['label' => $label, 'amount' => round(array_sum($amounts), 2), 'count' => count($amounts)])->values()->all();
    }

    /**
     * The biggest 8, the rest summed as "Other".
     *
     * @param  Collection<string, mixed>  $totals
     * @return array<int, array{label: string, amount: float}>
     */
    private function top(Collection $totals): array
    {
        $sorted = $totals->map(fn ($v) => round((float) $v, 2))->filter()->sortDesc();
        $rows = $sorted->take(8)->map(fn ($amount, $label) => ['label' => (string) $label, 'amount' => $amount])->values();
        if ($sorted->count() > 8) {
            $rows->push(['label' => 'Other', 'amount' => round($sorted->slice(8)->sum(), 2)]);
        }

        return $rows->all();
    }

    /** @return array<int, array{name: string, seconds: int, billable_seconds: int}> */
    private function team(Carbon $from, Carbon $to): array
    {
        $timers = TaskTimer::whereHas('task')->whereBetween('start_time', [$from->copy()->utc(), $to->copy()->endOfDay()->utc()])->with('task:id,billable')->get();
        $names = User::whereIn('id', $timers->pluck('user_id')->unique())->pluck('full_name', 'id');

        return $timers->groupBy('user_id')->map(fn ($rows, $id) => [
            'name' => $names[$id] ?? "#{$id}",
            'seconds' => (int) $rows->sum(fn (TaskTimer $t) => $t->durationSeconds()),
            'billable_seconds' => (int) $rows->filter(fn (TaskTimer $t) => $t->task?->billable)->sum(fn (TaskTimer $t) => $t->durationSeconds()),
        ])->sortByDesc('seconds')->take(10)->values()->all();
    }

    /**
     * Open projects: progress, time, money invoiced and how the deadline looks.
     *
     * @return array<int, array<string, mixed>>
     */
    private function projects(): array
    {
        $today = Carbon::today(self::TZ)->toDateString();
        $projects = Project::whereIn('status', [ProjectStatus::NotStarted, ProjectStatus::InProgress, ProjectStatus::OnHold])->with('customer:id,name')->orderBy('deadline')->limit(12)->get();
        $invoiced = Invoice::whereIn('project_id', $projects->pluck('id'))->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])->selectRaw('project_id, sum(total) as total')->groupBy('project_id')->pluck('total', 'project_id');

        return $projects->map(fn (Project $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'customer' => $p->customer?->name,
            'status' => $p->status->value,
            'progress' => $p->calculatedProgress(),
            'hours' => round($p->totalLoggedSeconds() / 3600, 1),
            'value' => (float) $p->project_cost,
            'invoiced' => round((float) ($invoiced[$p->id] ?? 0), 2),
            'deadline' => $p->deadline?->toDateString(),
            'late' => $p->deadline !== null && $p->deadline->toDateString() < $today,
        ])->all();
    }

    /** @return array<string, mixed> */
    private function leads(Collection $months, Carbon $from, Carbon $to, callable $key): array
    {
        $range = [$from->copy()->utc(), $to->copy()->endOfDay()->utc()];
        $created = Lead::whereBetween('created_at', $range)->with('source:id,name')->get(['id', 'created_at', 'lead_source_id']);
        $converted = Lead::whereBetween('converted_at', $range)->get(['id', 'converted_at']);
        $local = fn ($date) => $key(Carbon::parse($date)->timezone(self::TZ));

        return [
            'new' => $this->perMonth($months, $created->groupBy(fn ($l) => $local($l->created_at))->map->count()),
            'converted' => $this->perMonth($months, $converted->groupBy(fn ($l) => $local($l->converted_at))->map->count()),
            'total_new' => $created->count(),
            'total_converted' => $converted->count(),
            'by_source' => $created->groupBy(fn (Lead $l) => $l->source?->name ?? 'No source')->map->count()->sortDesc()->take(8)->map(fn ($c, $s) => ['label' => (string) $s, 'count' => $c])->values(),
        ];
    }

    /** @return array<string, mixed> */
    private function tickets(Carbon $from, Carbon $to): array
    {
        $tickets = Ticket::whereNull('merged_into_id')->whereBetween('created_at', [$from->copy()->utc(), $to->copy()->endOfDay()->utc()])->with('department:id,name')->get(['id', 'support_department_id']);

        return [
            'opened' => $tickets->count(),
            'by_department' => $tickets->groupBy(fn (Ticket $t) => $t->department?->name ?? 'No department')->map->count()->sortDesc()->map(fn ($c, $d) => ['label' => (string) $d, 'count' => $c])->values(),
        ];
    }
}
