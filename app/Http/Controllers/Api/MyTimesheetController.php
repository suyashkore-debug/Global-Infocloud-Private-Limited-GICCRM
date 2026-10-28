<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TaskTimer;
use App\Models\User;
use App\Services\Timesheets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Perfex "My Timesheets": your logged time per task for a range, a per-day chart and your
 * totals. With the reports permission you can switch to every staff member's timesheets.
 */
class MyTimesheetController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate([
            'range' => ['nullable', Rule::in(['today', 'this_month', 'last_month', 'this_week', 'last_week', 'period'])],
            'from' => ['required_if:range,period', 'nullable', 'date'],
            'to' => ['required_if:range,period', 'nullable', 'date', 'after_or_equal:from'],
            'view_all' => ['boolean'],
            'staff_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer'],
            'project_ids' => ['nullable', 'array'],
            'project_ids.*' => ['integer'],
            'group_by_task' => ['boolean'],
        ]);
        $viewAll = ($data['view_all'] ?? false) && $me->hasPermission('reports', 'view');
        [$from, $to] = Timesheets::range($data['range'] ?? 'today', $data['from'] ?? null, $data['to'] ?? null);

        $timers = TaskTimer::query()
            ->whereHas('task')
            ->whereBetween('start_time', [$from, $to])
            ->when(! $viewAll, fn ($q) => $q->where('user_id', $me->id))
            ->when($viewAll && ! empty($data['staff_id']), fn ($q) => $q->where('user_id', $data['staff_id']))
            ->when(! empty($data['project_ids']), fn ($q) => $q->whereHas('task', fn ($t) => $t->whereIn('project_id', $data['project_ids'])))
            ->when(! empty($data['customer_id']), fn ($q) => $q->whereHas('task.project', fn ($p) => $p->where('customer_id', $data['customer_id'])))
            ->with(['task:id,name,project_id', 'task.project:id,name,customer_id', 'task.project.customer:id,name'])
            ->orderByDesc('start_time')
            ->get();
        $names = User::whereIn('id', $timers->pluck('user_id')->unique())->pluck('full_name', 'id');

        $row = fn (TaskTimer $t) => [
            'id' => $t->id,
            'staff' => ['id' => $t->user_id, 'full_name' => $names[$t->user_id] ?? null],
            'task' => ['id' => $t->task->id, 'name' => $t->task->name],
            'project' => $t->task->project ? ['id' => $t->task->project->id, 'name' => $t->task->project->name, 'customer' => $t->task->project->customer?->name] : null,
            'start_time' => $t->start_time->toIso8601String(),
            'end_time' => $t->end_time?->toIso8601String(),
            'note' => $t->note,
            'seconds' => $t->roundedSeconds(),
        ];

        $rows = ($data['group_by_task'] ?? false)
            ? $timers->groupBy(fn (TaskTimer $t) => $t->task_id.'-'.$t->user_id)->map(fn ($group) => [
                ...$row($group->first()),
                'start_time' => null,
                'end_time' => null,
                'note' => null,
                'seconds' => $group->sum(fn (TaskTimer $t) => $t->roundedSeconds()),
            ])->values()
            : $timers->map($row)->values();

        return response()->json([
            'data' => $rows,
            'meta' => [
                'view_all' => $viewAll,
                'can_view_all' => $me->hasPermission('reports', 'view'),
                'total_seconds' => $timers->sum(fn (TaskTimer $t) => $t->roundedSeconds()),
                'chart' => Timesheets::perDay($timers, $from, $to),
                'stats' => Timesheets::stats($me->id),
                'staff' => $viewAll ? User::whereIn('id', TaskTimer::whereHas('task')->distinct()->pluck('user_id'))->orderBy('full_name')->get(['id', 'full_name']) : [],
            ],
        ]);
    }
}
