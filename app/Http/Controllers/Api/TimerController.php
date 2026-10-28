<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\TimesheetRequest;
use App\Http\Resources\TimerResource;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Services\Options;
use App\Services\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Task timers and timesheet entries.
 */
class TimerController extends Controller
{
    public function __construct(private TaskService $tasks) {}

    /**
     * The current user's started timers for the header dropdown, each with the user's total
     * logged time on that task, and whether a timer without a task can be started now.
     */
    public function running(Request $request): JsonResponse
    {
        $me = $request->user();
        $timers = TaskTimer::where('user_id', $me->id)
            ->whereNull('end_time')
            ->where(fn ($q) => $q->whereHas('task')->orWhere(fn ($q) => $q->whereNull('task_id')->where('company_id', $me->company_id)))
            ->with('task.project:id,name')
            ->latest('start_time')
            ->get();
        $logged = TaskTimer::where('user_id', $me->id)
            ->whereIn('task_id', $timers->pluck('task_id')->filter())
            ->get()
            ->groupBy('task_id')
            ->map(fn ($rows) => $rows->sum(fn (TaskTimer $t) => $t->durationSeconds()));

        return response()->json([
            'data' => $timers->map(fn (TaskTimer $t) => [
                ...(new TimerResource($t))->resolve($request),
                'total_logged_seconds' => (int) ($logged[$t->task_id] ?? 0),
            ]),
            'meta' => ['can_start_blank' => $this->canStartBlank($me->id, $timers)],
        ]);
    }

    public function start(Request $request, Task $task): TimerResource
    {
        $this->authorize('trackTime', $task);
        $data = $request->validate(['note' => ['nullable', 'string', 'max:5000']]);

        return new TimerResource($this->tasks->startTimer($task->load('project'), $data['note'] ?? null));
    }

    /**
     * Perfex header "Start Timer": a timer without a task, assigned to a task when stopped.
     */
    public function startBlank(Request $request): TimerResource
    {
        $me = $request->user();
        $running = TaskTimer::where('user_id', $me->id)->whereNull('end_time')->get();
        abort_unless($this->canStartBlank($me->id, $running), 422, 'A timer is already running.');

        return new TimerResource($this->tasks->startTimer(null));
    }

    /**
     * Stop a timer with a note. A timer without a task needs one of the user's open tasks;
     * an admin may stop another member's forgotten timer.
     */
    public function stop(Request $request, TaskTimer $timer): TimerResource
    {
        $me = $request->user();
        $own = (int) $timer->user_id === (int) $me->id;
        abort_unless($own || ($timer->task && $me->can('update', $timer->task)), 403);
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:5000'],
            'task_id' => [$timer->task_id ? 'nullable' : 'required', 'integer'],
        ], ['task_id.required' => 'Select the task you worked on.']);

        $task = null;
        if (! $timer->task_id) {
            abort_unless($own, 403);
            $task = Task::find($data['task_id']);
            abort_unless($task && $task->isAssignee($me) && $task->status !== TaskStatus::Complete, 422, 'You can only log time on your open assigned tasks.');
        }

        $this->tasks->stopTimer($timer, $data['note'] ?? null, $task);

        return new TimerResource($timer->refresh());
    }

    /**
     * Header trash icon: throw away the user's own still-running timer.
     */
    public function discard(Request $request, TaskTimer $timer): JsonResponse
    {
        abort_unless((int) $timer->user_id === (int) $request->user()->id && $timer->isRunning(), 403);
        $timer->delete();

        return response()->json(['message' => 'Timer deleted.']);
    }

    /**
     * Tasks a header timer can be assigned to: the user's open assigned tasks.
     */
    public function assignableTasks(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q'));
        $tasks = Task::query()
            ->whereHas('assignees', fn ($a) => $a->where('user_id', $request->user()->id))
            ->where('status', '!=', TaskStatus::Complete)
            ->when($q !== '', fn ($t) => $t->where('name', 'like', "%{$q}%"))
            ->with('project:id,name')
            ->latest('id')
            ->limit(30)
            ->get(['id', 'name', 'project_id']);

        return response()->json(['data' => $tasks->map(fn (Task $t) => ['id' => $t->id, 'name' => $t->name, 'project' => $t->project?->name])]);
    }

    /**
     * Perfex: one blank timer at a time, and none while task timers run when starting a new
     * timer stops the others.
     *
     * @param  Collection<int, TaskTimer>  $running
     */
    private function canStartBlank(int $userId, Collection $running): bool
    {
        if ($running->contains(fn (TaskTimer $t) => $t->task_id === null)) {
            return false;
        }

        return ! (Options::get('auto_stop_tasks_timers_on_new_timer') === '1' && $running->isNotEmpty());
    }

    /**
     * Log time manually. Logging for someone else needs edit rights on the task.
     */
    public function store(TimesheetRequest $request, Task $task): TimerResource
    {
        $data = $request->validated();
        $forSomeoneElse = ! empty($data['user_id']) && (int) $data['user_id'] !== (int) $request->user()->id;
        $this->authorize($forSomeoneElse ? 'update' : 'trackTime', $task);

        return new TimerResource($this->tasks->logTime($task, $data)->load('user'));
    }

    public function update(TimesheetRequest $request, TaskTimer $timer): TimerResource
    {
        $this->authorizeTimer($request, $timer);

        return new TimerResource($this->tasks->logTime($timer->task, $request->validated(), $timer)->load('user'));
    }

    public function destroy(Request $request, TaskTimer $timer): JsonResponse
    {
        $this->authorizeTimer($request, $timer);
        $this->tasks->deleteTimer($timer);

        return response()->json(['message' => 'Timesheet deleted.']);
    }

    private function authorizeTimer(Request $request, TaskTimer $timer): void
    {
        abort_unless($timer->task !== null, 404);
        abort_unless((int) $timer->user_id === (int) $request->user()->id || $request->user()->can('update', $timer->task), 403);
    }
}
