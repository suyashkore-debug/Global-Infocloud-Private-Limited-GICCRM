<?php

namespace App\Http\Controllers\Api;

use App\Enums\InvoiceStatus;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\Payment;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Models\Ticket;
use App\Models\TicketStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        $projectCounts = Project::visibleTo($user)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $myTasks = Task::visibleTo($user)->whereHas('assignees', fn (Builder $q) => $q->where('user_id', $user->id));

        $weekSeconds = TaskTimer::where('user_id', $user->id)
            ->where('start_time', '>=', self::today()->startOfWeek()->utc())
            ->get()
            ->sum(fn (TaskTimer $timer) => $timer->durationSeconds());

        return response()->json(['data' => [
            'projects_by_status' => collect(ProjectStatus::cases())->mapWithKeys(fn ($s) => [$s->value => (int) ($projectCounts[$s->value] ?? 0)]),
            'my_tasks_open' => (clone $myTasks)->where('status', '!=', TaskStatus::Complete)->count(),
            'my_tasks_overdue' => (clone $myTasks)->where('status', '!=', TaskStatus::Complete)->whereDate('due_date', '<', self::today()->toDateString())->count(),
            'my_tasks_due_today' => (clone $myTasks)->where('status', '!=', TaskStatus::Complete)->whereDate('due_date', self::today()->toDateString())->count(),
            'logged_this_week_seconds' => $weekSeconds,
            'upcoming_tasks' => TaskResource::collection(
                (clone $myTasks)->where('status', '!=', TaskStatus::Complete)
                    ->with(['project:id,name'])
                    ->orderByRaw('due_date is null, due_date')
                    ->limit(8)
                    ->get()
            ),
        ]]);
    }

    /**
     * The dashboard's business panels, each only for people who may see it: money in and out
     * (reports), the lead pipeline, open tickets, the team's hours this week, project deadlines
     * and the user's own week of due tasks.
     */
    public function insights(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = ['week' => $this->myWeek($user), 'deadlines' => $this->deadlines($user)];

        if ($user->hasPermission('reports', 'view')) {
            $data['finance'] = $this->finance($user);
            $data['team_hours'] = $this->teamHours();
        }
        if ($user->can('viewAny', Lead::class)) {
            $data['leads'] = $this->leadPipeline($user);
        }
        if ($user->can('viewAny', Ticket::class)) {
            $data['tickets'] = $this->ticketStatuses($user);
        }

        return response()->json(['data' => $data]);
    }

    /** Calendar dates as GIC's people live them (the app clock is UTC). */
    private static function today(): Carbon
    {
        return Carbon::today('Asia/Kolkata');
    }

    /** @return array<string, mixed> */
    private function finance(User $user): array
    {
        $start = self::today()->startOfMonth()->subMonths(11);
        $months = collect(range(0, 11))->map(fn ($i) => $start->copy()->addMonths($i));
        $key = fn ($date) => $date->format('Y-m');

        $income = Payment::where('date', '>=', $start->toDateString())->whereHas('invoice')->get(['amount', 'date'])->groupBy(fn (Payment $p) => $key($p->date))->map->sum('amount');
        $expenses = Expense::where('date', '>=', $start->toDateString())->with(['tax', 'tax2'])->get()->groupBy(fn (Expense $e) => $key($e->date))->map(fn ($rows) => $rows->sum(fn (Expense $e) => $e->totalWithTax()));
        $open = Invoice::visibleTo($user)->whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid, InvoiceStatus::Overdue])->with(['payments', 'appliedCredits'])->get();
        $overdue = $open->filter(fn (Invoice $i) => $i->status === InvoiceStatus::Overdue || ($i->due_date && $i->due_date->toDateString() < self::today()->toDateString()));

        return [
            'months' => $months->map(fn ($m) => $m->format('M y'))->values(),
            'income' => $months->map(fn ($m) => round((float) ($income[$key($m)] ?? 0), 2))->values(),
            'expenses' => $months->map(fn ($m) => round((float) ($expenses[$key($m)] ?? 0), 2))->values(),
            'outstanding' => round($open->sum(fn (Invoice $i) => $i->amountDue()), 2),
            'overdue' => round($overdue->sum(fn (Invoice $i) => $i->amountDue()), 2),
            'overdue_count' => $overdue->count(),
        ];
    }

    /** @return array<int, array{name: string, seconds: int}> */
    private function teamHours(): array
    {
        $timers = TaskTimer::whereHas('task')->where('start_time', '>=', self::today()->startOfWeek()->utc())->get();
        $names = User::whereIn('id', $timers->pluck('user_id')->unique())->pluck('full_name', 'id');

        return $timers->groupBy('user_id')
            ->map(fn ($rows, $id) => ['name' => $names[$id] ?? "#{$id}", 'seconds' => (int) $rows->sum(fn (TaskTimer $t) => $t->durationSeconds())])
            ->sortByDesc('seconds')->take(8)->values()->all();
    }

    /** @return array<string, mixed> */
    private function leadPipeline(User $user): array
    {
        $leads = Lead::visibleTo($user)->where('lost', false)->where('junk', false);
        $counts = (clone $leads)->selectRaw('lead_status_id, count(*) as total, sum(lead_value) as value')->groupBy('lead_status_id')->get()->keyBy('lead_status_id');

        return [
            'statuses' => LeadStatus::orderBy('status_order')->get()->map(fn (LeadStatus $s) => [
                'name' => $s->name,
                'color' => $s->color,
                'count' => (int) ($counts[$s->id]->total ?? 0),
                'value' => round((float) ($counts[$s->id]->value ?? 0), 2),
            ])->values(),
            'new_this_month' => (clone $leads)->where('created_at', '>=', self::today()->startOfMonth()->utc())->count(),
            'converted_this_month' => Lead::visibleTo($user)->where('converted_at', '>=', self::today()->startOfMonth()->utc())->count(),
        ];
    }

    /** @return array<int, array{name: string, color: ?string, count: int}> */
    private function ticketStatuses(User $user): array
    {
        $counts = Ticket::visibleTo($user)->whereNull('merged_into_id')->selectRaw('ticket_status_id, count(*) as total')->groupBy('ticket_status_id')->pluck('total', 'ticket_status_id');

        return TicketStatus::orderBy('status_order')->get()
            ->map(fn (TicketStatus $s) => ['name' => $s->name, 'color' => $s->color, 'count' => (int) ($counts[$s->id] ?? 0), 'closed' => $s->system_key === 'closed'])
            ->values()->all();
    }

    /**
     * The user's open tasks due on each of the next 7 days (with today's overdue on day one).
     *
     * @return array<int, array{date: string, count: int}>
     */
    private function myWeek(User $user): array
    {
        $due = Task::visibleTo($user)->whereHas('assignees', fn (Builder $q) => $q->where('user_id', $user->id))
            ->where('status', '!=', TaskStatus::Complete)->whereNotNull('due_date')->whereDate('due_date', '<=', self::today()->addDays(6))
            ->pluck('due_date')->map(fn ($d) => max(self::today()->toDateString(), Carbon::parse($d)->toDateString()))->countBy();

        return collect(range(0, 6))->map(fn ($i) => self::today()->addDays($i)->toDateString())
            ->map(fn ($d) => ['date' => $d, 'count' => (int) ($due[$d] ?? 0)])->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function deadlines(User $user): array
    {
        return Project::visibleTo($user)->whereNotNull('deadline')->whereNotIn('status', [ProjectStatus::Finished, ProjectStatus::Cancelled])
            ->whereDate('deadline', '<=', self::today()->addDays(30))->with('customer:id,name')->orderBy('deadline')->limit(6)->get()
            ->map(fn (Project $p) => [
                'id' => $p->id, 'name' => $p->name, 'customer' => $p->customer?->name, 'deadline' => $p->deadline->toDateString(),
                'days_left' => (int) self::today()->diffInDays($p->deadline, false), 'progress' => $p->calculatedProgress(),
            ])->all();
    }
}
