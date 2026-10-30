<?php

namespace App\Http\Controllers\Api;

use App\Enums\EstimateStatus;
use App\Enums\InvoiceStatus;
use App\Enums\ProjectStatus;
use App\Enums\ProposalStatus;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\CalendarEvent;
use App\Models\Contract;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Payment;
use App\Models\Project;
use App\Models\ProjectActivity;
use App\Models\Proposal;
use App\Models\Reminder;
use App\Models\Task;
use App\Models\Ticket;
use App\Models\TicketReply;
use App\Models\TicketStatus;
use App\Models\User;
use App\Services\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * The Perfex dashboard widgets, each sent only to people who may see it: quick stats, finance
 * overview, the user widget (my projects, reminders, tickets, latest activity), contracts about to
 * expire, upcoming events, project activity, tickets awaiting reply by department, the tickets
 * report by staff (admins) and the payment records chart.
 */
class DashboardWidgetsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = [
            'quick_stats' => $this->quickStats($user),
            'my_projects' => $this->myProjects($user),
            'my_reminders' => $this->myReminders($user),
            'upcoming_events' => $this->upcomingEvents($user),
            'project_activity' => $this->projectActivity($user),
        ];
        $finance = array_filter([
            'invoices' => $user->can('viewAny', Invoice::class) ? $this->invoiceOverview($user) : null,
            'estimates' => $user->can('viewAny', Estimate::class) ? $this->statusOverview(Estimate::visibleTo($user), EstimateStatus::cases(), 'total') : null,
            'proposals' => $user->can('viewAny', Proposal::class) ? $this->statusOverview(Proposal::visibleTo($user), ProposalStatus::cases(), 'total') : null,
        ]);
        if ($finance) {
            $data['finance_overview'] = $finance;
        }
        if ($user->can('viewAny', Ticket::class)) {
            $data['tickets'] = $this->openTickets($user);
            $data['tickets_by_department'] = $this->ticketsByDepartment($user);
        }
        if ($user->can('viewAny', Contract::class)) {
            $data['contracts_expiring'] = $this->contractsExpiring($user);
        }
        if ($user->isAdmin()) {
            $data['latest_activity'] = ActivityLog::latest('created_at')->limit(15)->get()
                ->map(fn (ActivityLog $a) => ['id' => $a->id, 'description' => $a->description, 'user' => $a->user_id ? User::find($a->user_id)?->full_name : null, 'created_at' => $a->created_at]);
        }
        $data['can_tickets_report'] = $user->isAdmin();
        $data['can_payments'] = $this->canPayments($user);

        return response()->json(['data' => $data]);
    }

    /**
     * Admins: per staff member, tickets assigned in the period and their state, replies written in
     * the period and the average time to their first reply.
     */
    public function ticketsReport(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $period = $request->validate(['period' => ['nullable', Rule::in(['this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year'])]])['period'] ?? 'this_month';
        [$from, $to] = $this->periodRange($period);

        $closed = TicketStatus::where('system_key', 'closed')->value('id');
        $tickets = Ticket::whereNull('merged_into_id')->whereNotNull('assigned_id')->whereBetween('created_at', [$from->utc(), $to->utc()])->get(['id', 'assigned_id', 'ticket_status_id', 'created_at']);
        $replies = TicketReply::whereNotNull('user_id')->whereHas('ticket')->whereBetween('created_at', [$from->copy()->utc(), $to->copy()->utc()])->get(['ticket_id', 'user_id', 'created_at']);
        $firstReplies = TicketReply::whereNotNull('user_id')->whereIn('ticket_id', $tickets->pluck('id'))->orderBy('created_at')->get(['ticket_id', 'user_id', 'created_at'])->unique('ticket_id')->keyBy('ticket_id');

        $staffIds = $tickets->pluck('assigned_id')->merge($replies->pluck('user_id'))->unique()->filter();
        $names = User::whereIn('id', $staffIds)->pluck('full_name', 'id');

        $rows = $staffIds->map(function ($id) use ($tickets, $replies, $firstReplies, $closed, $names) {
            $mine = $tickets->where('assigned_id', $id);
            $waits = $mine->map(fn ($t) => isset($firstReplies[$t->id]) ? $t->created_at->diffInMinutes($firstReplies[$t->id]->created_at) : null)->filter(fn ($m) => $m !== null);

            return [
                'user_id' => (int) $id,
                'name' => $names[$id] ?? "#{$id}",
                'total_assigned' => $mine->count(),
                'open' => $mine->where('ticket_status_id', '!=', $closed)->count(),
                'closed' => $mine->where('ticket_status_id', $closed)->count(),
                'replies' => $replies->where('user_id', $id)->count(),
                'average_reply_minutes' => $waits->isEmpty() ? null : (int) round($waits->avg()),
            ];
        })->sortByDesc('total_assigned')->values();

        return response()->json(['data' => ['period' => $period, 'rows' => $rows]]);
    }

    /**
     * Perfex "Payment Records": this week against last week by day, or this year by month.
     */
    public function payments(Request $request): JsonResponse
    {
        abort_unless($this->canPayments($request->user()), 403);
        $period = $request->validate(['period' => ['nullable', Rule::in(['weekly', 'monthly'])]])['period'] ?? 'weekly';
        $today = Carbon::today('Asia/Kolkata');

        if ($period === 'monthly') {
            $start = $today->copy()->startOfYear();
            $sums = Payment::whereBetween('date', [$start->toDateString(), $start->copy()->endOfYear()->toDateString()])->whereHas('invoice')->get(['amount', 'date'])
                ->groupBy(fn (Payment $p) => $p->date->format('n'))->map->sum('amount');

            return response()->json(['data' => [
                'period' => 'monthly',
                'labels' => collect(range(1, 12))->map(fn ($m) => Carbon::create($start->year, $m, 1)->format('M'))->all(),
                'series' => [['label' => (string) $start->year, 'values' => collect(range(1, 12))->map(fn ($m) => round((float) ($sums[(string) $m] ?? 0), 2))->all()]],
            ]]);
        }

        $week = $today->copy()->startOfWeek();
        $sumsFor = function (Carbon $monday) {
            $sums = Payment::whereBetween('date', [$monday->toDateString(), $monday->copy()->addDays(6)->toDateString()])->whereHas('invoice')->get(['amount', 'date'])
                ->groupBy(fn (Payment $p) => $p->date->toDateString())->map->sum('amount');

            return collect(range(0, 6))->map(fn ($i) => round((float) ($sums[$monday->copy()->addDays($i)->toDateString()] ?? 0), 2))->all();
        };

        return response()->json(['data' => [
            'period' => 'weekly',
            'labels' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            'series' => [
                ['label' => 'This week', 'values' => $sumsFor($week)],
                ['label' => 'Last week', 'values' => $sumsFor($week->copy()->subWeek())],
            ],
        ]]);
    }

    private function canPayments(User $user): bool
    {
        return $user->hasPermission('payments', 'view') || $user->hasPermission('reports', 'view');
    }

    /** @return array<string, mixed> */
    private function quickStats(User $user): array
    {
        $stats = [];
        if ($user->can('viewAny', Invoice::class)) {
            $invoices = Invoice::visibleTo($user)->whereNotIn('status', [InvoiceStatus::Cancelled, InvoiceStatus::Draft]);
            $stats['invoices_awaiting'] = [
                'count' => (clone $invoices)->whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid, InvoiceStatus::Overdue])->count(),
                'total' => (clone $invoices)->count(),
            ];
        }
        if ($user->can('viewAny', Lead::class)) {
            $leads = Lead::visibleTo($user);
            $stats['leads_converted'] = ['count' => (clone $leads)->whereNotNull('customer_id')->count(), 'total' => (clone $leads)->count()];
        }
        $projects = Project::visibleTo($user);
        $stats['projects_in_progress'] = ['count' => (clone $projects)->where('status', ProjectStatus::InProgress)->count(), 'total' => (clone $projects)->count()];
        // As Perfex: staff who may not see every task count the tasks assigned to them.
        $tasks = $user->hasPermission('tasks', 'view') ? Task::visibleTo($user) : Task::visibleTo($user)->whereHas('assignees', fn (Builder $q) => $q->where('user_id', $user->id));
        $stats['tasks_not_finished'] = ['count' => (clone $tasks)->where('status', '!=', TaskStatus::Complete)->count(), 'total' => (clone $tasks)->count()];

        return $stats;
    }

    /**
     * Invoices by status, with Perfex's "not sent" count.
     *
     * @return array<string, mixed>
     */
    private function invoiceOverview(User $user): array
    {
        $overview = $this->statusOverview(Invoice::visibleTo($user), InvoiceStatus::cases(), 'total');
        $overview['not_sent'] = Invoice::visibleTo($user)->where('sent', false)->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])->count();

        return $overview;
    }

    /**
     * How many documents are in each status, out of all of them.
     *
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     * @param  array<int, \BackedEnum>  $cases
     * @return array<string, mixed>
     */
    private function statusOverview(Builder $query, array $cases, string $amountColumn): array
    {
        $counts = (clone $query)->selectRaw("status, count(*) as total, sum({$amountColumn}) as amount")->groupBy('status')->get()->keyBy(fn ($r) => (int) ($r->status instanceof \BackedEnum ? $r->status->value : $r->status));

        return [
            'total' => (int) $counts->sum('total'),
            'statuses' => collect($cases)->map(fn ($case) => [
                'id' => $case->value,
                'count' => (int) ($counts[$case->value]->total ?? 0),
                'amount' => round((float) ($counts[$case->value]->amount ?? 0), 2),
            ])->values(),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function myProjects(User $user): array
    {
        return Project::visibleTo($user)->whereHas('members', fn (Builder $q) => $q->where('user_id', $user->id))
            ->whereNotIn('status', [ProjectStatus::Finished, ProjectStatus::Cancelled])->with('customer:id,name')->orderByRaw('deadline is null, deadline')->limit(10)->get()
            ->map(fn (Project $p) => ['id' => $p->id, 'name' => $p->name, 'customer' => $p->customer?->name, 'start_date' => $p->start_date?->toDateString(), 'deadline' => $p->deadline?->toDateString(), 'status' => $p->status->value, 'progress' => $p->calculatedProgress()])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function myReminders(User $user): array
    {
        $links = ['Lead' => '/leads?lead=', 'Customer' => '/customers/', 'Contract' => '/contracts/', 'Ticket' => '/tickets/', 'Expense' => '/expenses/', 'Invoice' => '/invoices/', 'Estimate' => '/estimates/', 'Proposal' => '/proposals/'];

        return Reminder::where('user_id', $user->id)->where('is_notified', false)->with('remindable')->orderBy('remind_at')->limit(10)->get()
            ->map(function (Reminder $r) use ($links) {
                $type = class_basename($r->remindable_type);
                $record = $r->remindable;

                return [
                    'id' => $r->id,
                    'description' => $r->description,
                    'remind_at' => $r->remind_at,
                    'related' => $record ? trim($type.' '.($record->name ?? $record->subject ?? '#'.$record->getKey())) : $type,
                    'link' => isset($links[$type]) && $record ? $links[$type].$record->getKey() : null,
                ];
            })->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function openTickets(User $user): array
    {
        $closed = TicketStatus::where('system_key', 'closed')->value('id');

        return Ticket::visibleTo($user)->whereNull('merged_into_id')->where('ticket_status_id', '!=', $closed)->with(['status:id,name,color', 'priority:id,name'])->latest('id')->limit(10)->get()
            ->map(fn (Ticket $t) => ['id' => $t->id, 'subject' => $t->subject, 'status' => $t->status?->only(['name', 'color']), 'priority' => $t->priority?->name, 'last_reply_at' => $t->last_reply_at, 'created_at' => $t->created_at])
            ->all();
    }

    /**
     * Tickets waiting for the team (not answered, not closed) per department.
     *
     * @return array<int, array{name: string, count: int}>
     */
    private function ticketsByDepartment(User $user): array
    {
        $done = TicketStatus::whereIn('system_key', ['closed', 'answered'])->pluck('id');

        return Ticket::visibleTo($user)->whereNull('merged_into_id')->whereNotIn('ticket_status_id', $done)->with('department:id,name')->get()
            ->groupBy(fn (Ticket $t) => $t->department?->name ?? 'No department')->map(fn ($rows, $name) => ['name' => $name, 'count' => $rows->count()])
            ->sortByDesc('count')->values()->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function contractsExpiring(User $user): array
    {
        $today = Carbon::today('Asia/Kolkata');
        $days = max(1, (int) Options::get('contract_expiration_before'));

        return Contract::visibleTo($user)->where('trash', false)->whereNotNull('end_date')
            ->whereBetween('end_date', [$today->toDateString(), $today->copy()->addDays($days)->toDateString()])->with('customer:id,name')->orderBy('end_date')->limit(10)->get()
            ->map(fn (Contract $c) => ['id' => $c->id, 'subject' => $c->subject, 'customer' => $c->customer?->name, 'start_date' => $c->start_date?->toDateString(), 'end_date' => $c->end_date?->toDateString()])
            ->all();
    }

    /**
     * Calendar events of this week and next week: public ones and the user's own.
     *
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function upcomingEvents(User $user): array
    {
        $monday = Carbon::today('Asia/Kolkata')->startOfWeek();
        $events = CalendarEvent::where(fn (Builder $q) => $q->where('public', true)->orWhere('user_id', $user->id))
            ->whereBetween('start', [$monday->copy()->utc(), $monday->copy()->addWeeks(2)->utc()])->orderBy('start')->limit(30)->get();
        $names = User::whereIn('id', $events->pluck('user_id')->unique())->pluck('full_name', 'id');
        $row = fn (CalendarEvent $e) => ['id' => $e->id, 'title' => $e->title, 'start' => $e->start, 'color' => $e->color, 'public' => (bool) $e->public, 'added_by' => $names[$e->user_id] ?? null];
        $nextWeek = $monday->copy()->addWeek()->utc();

        return [
            'this_week' => $events->filter(fn ($e) => $e->start->lt($nextWeek))->map($row)->values()->all(),
            'next_week' => $events->filter(fn ($e) => $e->start->gte($nextWeek))->map($row)->values()->all(),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function projectActivity(User $user): array
    {
        return ProjectActivity::whereIn('project_id', Project::visibleTo($user)->select('id'))->with('project:id,name')->latest('created_at')->limit(20)->get()
            ->map(fn (ProjectActivity $a) => [
                'id' => $a->id,
                'project' => $a->project?->only(['id', 'name']),
                'user' => $a->user_id ? User::find($a->user_id)?->full_name : null,
                'description_key' => $a->description_key,
                'additional_data' => $a->additional_data,
                'created_at' => $a->created_at,
            ])->all();
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function periodRange(string $period): array
    {
        $now = Carbon::now('Asia/Kolkata');

        return match ($period) {
            'this_week' => [$now->copy()->startOfWeek(), $now->copy()->endOfWeek()],
            'last_week' => [$now->copy()->subWeek()->startOfWeek(), $now->copy()->subWeek()->endOfWeek()],
            'last_month' => [$now->copy()->subMonthNoOverflow()->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()],
            'this_year' => [$now->copy()->startOfYear(), $now->copy()->endOfYear()],
            'last_year' => [$now->copy()->subYear()->startOfYear(), $now->copy()->subYear()->endOfYear()],
            default => [$now->copy()->startOfMonth(), $now->copy()->endOfMonth()],
        };
    }
}
