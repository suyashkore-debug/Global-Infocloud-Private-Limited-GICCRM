<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\TaskRequest;
use App\Http\Resources\AttachmentResource;
use App\Http\Resources\ChecklistItemResource;
use App\Http\Resources\CommentResource;
use App\Http\Resources\TaskResource;
use App\Http\Resources\TimerResource;
use App\Models\Project;
use App\Models\Task;
use App\Services\TaskService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    private const SORTABLE = ['id', 'name', 'start_date', 'due_date', 'priority', 'status', 'kanban_order', 'milestone_order'];

    public function __construct(private TaskService $tasks) {}

    /**
     * Tasks list / board. Filters as in Perfex: status, assigned to me / a staff member, priority,
     * project, milestone, due (today, overdue, upcoming), search.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        $query = $this->filtered($request);

        $statusCounts = (clone $query)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        if ($request->has('status')) {
            $query->whereIn('status', array_map('intval', (array) $request->input('status')));
        }

        $sort = in_array($request->input('sort'), self::SORTABLE, true) ? $request->input('sort') : 'id';
        $direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

        $query->with(['project:id,name,customer_id', 'project.customer:id,name', 'milestone:id,name,color', 'assignees.user', 'followers', 'tags', 'timers'])
            ->withCount(['checklistItems', 'finishedChecklistItems', 'comments', 'attachments'])
            ->orderBy($sort, $direction);

        $tasks = $request->boolean('all')
            ? $query->limit(1000)->get()
            : $query->paginate($request->integer('per_page', 25));

        return TaskResource::collection($tasks)->additional([
            'meta' => [
                'status_counts' => collect(TaskStatus::cases())->mapWithKeys(fn (TaskStatus $s) => [$s->value => (int) ($statusCounts[$s->value] ?? 0)]),
                'can_create' => $user->can('create', Task::class),
                'summary' => $this->summary($request),
            ],
        ]);
    }

    /**
     * Perfex tasks summary cards: per status, the tasks you can see and how many are yours.
     *
     * @return array<int, array{total: int, mine: int}>
     */
    private function summary(Request $request): array
    {
        $user = $request->user();
        $base = Task::query()->visibleTo($user)->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id));
        $total = (clone $base)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $mine = (clone $base)->whereHas('assignees', fn (Builder $a) => $a->where('user_id', $user->id))
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return collect(TaskStatus::cases())->mapWithKeys(fn (TaskStatus $s) => [$s->value => [
            'total' => (int) ($total[$s->value] ?? 0),
            'mine' => (int) ($mine[$s->value] ?? 0),
        ]])->all();
    }

    /**
     * Perfex "Tasks Overview": tasks by month of their start date for a year, optionally for one
     * member (logged time then counts only theirs), one month, one status or one project.
     */
    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'year' => ['nullable', 'integer'],
            'month' => ['nullable', 'integer', 'between:1,12'],
            'member' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
            'project_id' => ['nullable', 'integer'],
        ]);
        $year = $data['year'] ?? (int) date('Y');
        $canViewAll = $user->hasPermission('tasks', 'view');
        $member = $canViewAll ? ($data['member'] ?? null) : $user->id;

        $tasks = Task::query()
            ->visibleTo($user)
            ->whereYear('start_date', $year)
            ->when($data['month'] ?? null, fn (Builder $q, int $m) => $q->whereMonth('start_date', $m))
            ->when($data['status'] ?? null, fn (Builder $q, int $s) => $q->where('status', $s))
            ->when($data['project_id'] ?? null, fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($member, fn (Builder $q, int $id) => $q->whereHas('assignees', fn (Builder $a) => $a->where('user_id', $id)))
            ->with(['project:id,name', 'assignees.user', 'timers', 'checklistItems:id,task_id,finished,finished_by'])
            ->withCount(['comments', 'attachments'])
            ->orderBy('start_date')
            ->get();

        $rows = $tasks->map(fn (Task $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'project' => $t->project ? ['id' => $t->project->id, 'name' => $t->project->name] : null,
            'start_date' => $t->start_date?->toDateString(),
            'due_date' => $t->due_date?->toDateString(),
            'status' => $t->status->value,
            'attachments' => $t->attachments_count,
            'comments' => $t->comments_count,
            'checklist_total' => $t->checklistItems->count(),
            'checklist_finished' => $t->checklistItems->where('finished', true)->when($member, fn ($c) => $c->where('finished_by', $member))->count(),
            'logged_seconds' => $t->timers->when($member, fn ($c) => $c->where('user_id', $member))->sum(fn ($timer) => $timer->durationSeconds()),
            'finished_on_time' => $t->status === TaskStatus::Complete
                ? ($t->due_date === null || ($t->date_finished && $t->date_finished->toDateString() <= $t->due_date->toDateString()))
                : null,
            'assignees' => $t->assignees->map(fn ($a) => $a->user?->full_name)->filter()->values(),
            'month' => (int) $t->start_date->format('n'),
        ]);

        $years = Task::query()->visibleTo($user)->whereNotNull('start_date')->selectRaw('distinct year(start_date) as y')->orderByDesc('y')->pluck('y');

        return response()->json([
            'data' => $rows->groupBy('month')->map(fn ($r) => $r->values()),
            'meta' => ['year' => $year, 'years' => $years->push($year)->unique()->sortDesc()->values(), 'can_view_all' => $canViewAll, 'member' => $member],
        ]);
    }

    public function store(TaskRequest $request): JsonResponse
    {
        $project = $request->integer('project_id') ? Project::findOrFail($request->integer('project_id')) : null;
        $this->authorize('create', [Task::class, $project]);

        $task = $this->tasks->create($request->validated());

        return $this->detail($task, 201);
    }

    /**
     * Full task for the task modal: checklist, comments, attachments, timers, reminders.
     */
    public function show(Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        return $this->detail($task);
    }

    public function update(TaskRequest $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);

        $this->tasks->update($task, $request->validated());

        return $this->detail($task->refresh());
    }

    /**
     * Gantt drag: new start and due dates.
     */
    public function dates(Request $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);
        $data = $request->validate([
            'start_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);
        $task->update($data);

        return response()->json(['data' => ['id' => $task->id, 'start_date' => $task->start_date->toDateString(), 'due_date' => $task->due_date?->toDateString()]]);
    }

    public function destroy(Task $task): JsonResponse
    {
        $this->authorize('delete', $task);

        $this->tasks->delete($task);

        return response()->json(['message' => 'Task deleted.']);
    }

    public function changeStatus(Request $request, Task $task): JsonResponse
    {
        $this->authorize('work', $task);
        $data = $request->validate(['status' => ['required', Rule::enum(TaskStatus::class)]]);

        $this->tasks->changeStatus($task, TaskStatus::from((int) $data['status']));

        return $this->detail($task->refresh());
    }

    public function changePriority(Request $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);
        $data = $request->validate(['priority' => ['required', Rule::enum(TaskPriority::class)]]);

        $task->update(['priority' => (int) $data['priority']]);

        return $this->detail($task);
    }

    public function changeMilestone(Request $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);
        $data = $request->validate([
            'milestone_id' => ['nullable', 'integer', Rule::exists('milestones', 'id')->where('project_id', $task->project_id)],
        ]);

        $task->update(['milestone_id' => $data['milestone_id'] ?? null]);

        return $this->detail($task);
    }

    public function copy(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);
        $this->authorize('create', [Task::class, $task->project]);

        $data = $request->validate([
            'copy_assignees' => ['boolean'],
            'copy_followers' => ['boolean'],
            'copy_checklist' => ['boolean'],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
        ]);

        $copy = $this->tasks->copy($task->load(['assignees', 'followers', 'checklistItems', 'tags']), [
            'status' => TaskStatus::from((int) ($data['status'] ?? TaskStatus::NotStarted->value)),
        ], [
            'assignees' => (bool) ($data['copy_assignees'] ?? false),
            'followers' => (bool) ($data['copy_followers'] ?? false),
            'checklist' => (bool) ($data['copy_checklist'] ?? false),
        ]);

        return $this->detail($copy, 201);
    }

    /**
     * Kanban drag & drop: new status and the order of the cards in that column.
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::enum(TaskStatus::class)],
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);
        $status = TaskStatus::from((int) $data['status']);

        foreach (array_values($data['order']) as $position => $taskId) {
            $task = Task::find($taskId);
            if (! $task || ! $request->user()->can('work', $task)) {
                continue;
            }
            if ($task->status !== $status) {
                $this->tasks->changeStatus($task, $status);
            }
            $task->update(['kanban_order' => $position + 1]);
        }

        return response()->json(['message' => 'Order saved.']);
    }

    /**
     * Perfex bulk actions on the tasks table.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer'],
            'action' => ['required', Rule::in(['delete', 'status', 'priority', 'assign', 'milestone', 'billable'])],
            'status' => ['required_if:action,status', 'nullable', Rule::enum(TaskStatus::class)],
            'priority' => ['required_if:action,priority', 'nullable', Rule::enum(TaskPriority::class)],
            'user_id' => ['required_if:action,assign', 'nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)],
            'milestone_id' => ['nullable', 'integer'],
            'billable' => ['boolean'],
        ]);

        $done = 0;
        foreach (Task::whereIn('id', $data['ids'])->get() as $task) {
            $ability = match ($data['action']) {
                'delete' => 'delete',
                'status' => 'work',
                default => 'update',
            };
            if (! $request->user()->can($ability, $task)) {
                continue;
            }

            match ($data['action']) {
                'delete' => $this->tasks->delete($task),
                'status' => $this->tasks->changeStatus($task, TaskStatus::from((int) $data['status'])),
                'priority' => $task->update(['priority' => (int) $data['priority']]),
                'assign' => $this->tasks->addAssignee($task, (int) $data['user_id']),
                'milestone' => $task->project_id && (! $data['milestone_id'] || $task->project->milestones()->whereKey($data['milestone_id'])->exists())
                    ? $task->update(['milestone_id' => $data['milestone_id'] ?: null])
                    : null,
                'billable' => $task->update(['billable' => (bool) ($data['billable'] ?? false)]),
            };
            $done++;
        }

        return response()->json(['message' => "{$done} task(s) updated.", 'updated' => $done]);
    }

    /**
     * @return Builder<Task>
     */
    private function filtered(Request $request): Builder
    {
        $user = $request->user();

        return Task::query()
            ->visibleTo($user)
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->has('milestone_id'), fn (Builder $q) => $request->input('milestone_id') === 'none'
                ? $q->whereNull('milestone_id')
                : $q->where('milestone_id', $request->integer('milestone_id')))
            ->when($request->has('priority'), fn (Builder $q) => $q->whereIn('priority', array_map('intval', (array) $request->input('priority'))))
            ->when($request->boolean('my_tasks'), fn (Builder $q) => $q->whereHas('assignees', fn (Builder $a) => $a->where('user_id', $user->id)))
            ->when($request->boolean('following'), fn (Builder $q) => $q->whereHas('followers', fn (Builder $a) => $a->where('user_id', $user->id)))
            ->when($request->integer('assignee_id'), fn (Builder $q, int $id) => $q->whereHas('assignees', fn (Builder $a) => $a->where('user_id', $id)))
            ->when($request->boolean('not_assigned'), fn (Builder $q) => $q->whereDoesntHave('assignees'))
            ->when($request->boolean('recurring'), fn (Builder $q) => $q->whereNotNull('repeat_every'))
            ->when($request->date('start_from'), fn (Builder $q, $d) => $q->whereDate('start_date', '>=', $d))
            ->when($request->date('start_to'), fn (Builder $q, $d) => $q->whereDate('start_date', '<=', $d))
            ->when($request->boolean('billable'), fn (Builder $q) => $q->where('billable', true))
            ->when($request->input('due') === 'today', fn (Builder $q) => $q->whereDate('due_date', today()))
            ->when($request->input('due') === 'overdue', fn (Builder $q) => $q->whereDate('due_date', '<', today())->where('status', '!=', TaskStatus::Complete))
            ->when($request->input('due') === 'upcoming', fn (Builder $q) => $q->whereDate('start_date', '>', today()))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhereHas('tags', fn (Builder $t) => $t->where('name', 'like', "%{$search}%"))));
    }

    private function detail(Task $task, int $status = 200): JsonResponse
    {
        $task->load([
            'project:id,name,billing_type',
            'milestone:id,name,color',
            'assignees.user',
            'followers.user',
            'tags',
            'creator',
            'timers.user',
            'checklistItems.finisher',
            'checklistItems.assignee',
            'comments.user',
            'comments.contact',
            'attachments.user',
            'reminders.user',
        ])->loadCount(['checklistItems', 'finishedChecklistItems', 'comments', 'attachments']);

        $request = request();

        return response()->json(['data' => [
            ...(new TaskResource($task))->toArray($request),
            'checklist' => ChecklistItemResource::collection($task->checklistItems)->toArray($request),
            'comments' => CommentResource::collection($task->comments)->toArray($request),
            'attachments' => AttachmentResource::collection($task->attachments)->toArray($request),
            'timers' => TimerResource::collection($task->timers->sortByDesc('start_time')->values())->toArray($request),
            'reminders' => $task->reminders->where('user_id', $request->user()->id)->values()->map(fn ($r) => [
                'id' => $r->id,
                'remind_at' => $r->remind_at,
                'description' => $r->description,
                'is_notified' => $r->is_notified,
            ]),
            'is_assignee' => $task->isAssignee($request->user()),
            'is_follower' => $task->isFollower($request->user()),
        ]], $status);
    }
}
