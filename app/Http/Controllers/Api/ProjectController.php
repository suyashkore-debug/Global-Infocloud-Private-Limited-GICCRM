<?php

namespace App\Http\Controllers\Api;

use App\Enums\BillingType;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ProjectCopyRequest;
use App\Http\Requests\ProjectRequest;
use App\Http\Resources\ActivityResource;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\StaffResource;
use App\Http\Resources\TimerResource;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Models\User;
use App\Services\ProjectInvoicer;
use App\Services\ProjectService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    private const SORTABLE = ['id', 'name', 'start_date', 'deadline', 'status', 'created_at'];

    public function __construct(private ProjectService $projects) {}

    /**
     * Projects list with Perfex's filters; meta.status_counts holds the summary cards.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        $statuses = $request->has('status')
            ? array_map('intval', (array) $request->input('status'))
            : collect(ProjectStatus::cases())->filter->shownByDefault()->map->value->values()->all();

        $base = Project::query()
            ->visibleTo($user)
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$search}%"))
                ->orWhereHas('tags', fn (Builder $t) => $t->where('name', 'like', "%{$search}%"))))
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('member_id'), fn (Builder $q, int $id) => $q->whereHas('members', fn (Builder $m) => $m->where('user_id', $id)));

        $statusCounts = (clone $base)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $sort = in_array($request->input('sort'), self::SORTABLE, true) ? $request->input('sort') : 'id';
        $direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

        $projects = $base
            ->whereIn('status', $statuses)
            ->with(['customer:id,name', 'members.user', 'tags', 'pins'])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 25));

        return ProjectResource::collection($projects)->additional([
            'meta' => [
                'status_counts' => collect(ProjectStatus::cases())->mapWithKeys(fn (ProjectStatus $s) => [$s->value => (int) ($statusCounts[$s->value] ?? 0)]),
            ],
        ]);
    }

    /**
     * The current user's pinned projects (shown in the sidebar, as in Perfex).
     */
    public function pinned(Request $request): JsonResponse
    {
        $projects = Project::visibleTo($request->user())
            ->whereHas('pins', fn (Builder $q) => $q->where('user_id', $request->user()->id))
            ->orderBy('name')
            ->get(['id', 'name', 'status', 'progress', 'progress_from_tasks']);

        return response()->json(['data' => $projects->map(fn (Project $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'status' => $p->status->value,
            'progress' => $p->calculatedProgress(),
        ])]);
    }

    public function store(ProjectRequest $request): ProjectResource
    {
        $this->authorize('create', Project::class);

        $project = $this->projects->create($request->validated());

        return new ProjectResource($this->loadForView($project));
    }

    public function show(Project $project): ProjectResource
    {
        $this->authorize('view', $project);

        return new ProjectResource($this->loadForView($project));
    }

    public function update(ProjectRequest $request, Project $project): ProjectResource
    {
        $this->authorize('update', $project);

        $this->projects->update($project, $request->validated());

        return new ProjectResource($this->loadForView($project->refresh()));
    }

    public function destroy(Project $project): JsonResponse
    {
        $this->authorize('delete', $project);

        $this->projects->delete($project);

        return response()->json(['message' => 'Project deleted.']);
    }

    public function changeStatus(Request $request, Project $project): ProjectResource
    {
        $this->authorize('update', $project);

        $data = $request->validate([
            'status' => ['required', Rule::enum(ProjectStatus::class)],
            'mark_all_tasks_complete' => ['boolean'],
            'notify_members' => ['boolean'],
        ]);

        $this->projects->changeStatus(
            $project,
            ProjectStatus::from((int) $data['status']),
            (bool) ($data['mark_all_tasks_complete'] ?? false),
            (bool) ($data['notify_members'] ?? false),
        );

        return new ProjectResource($this->loadForView($project->refresh()));
    }

    public function copy(ProjectCopyRequest $request, Project $project): ProjectResource
    {
        $this->authorize('view', $project);
        $this->authorize('create', Project::class);

        $copy = $this->projects->copy($project->load(['milestones', 'tags']), $request->validated());

        return new ProjectResource($this->loadForView($copy));
    }

    public function togglePin(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        return response()->json(['is_pinned' => $this->projects->togglePin($project)]);
    }

    public function syncMembers(Request $request, Project $project): ProjectResource
    {
        $this->authorize('update', $project);

        $data = $request->validate([
            'members' => ['present', 'array'],
            'members.*' => ['integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)->where('is_active', true)],
        ]);

        $this->projects->syncMembers($project, $data['members']);

        return new ProjectResource($this->loadForView($project));
    }

    /**
     * Perfex project overview: progress, tasks, days, logged time, money.
     */
    public function overview(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $tasks = $project->tasks()->with('timers')->get();
        $timers = $tasks->flatMap->timers;
        $totalSeconds = $timers->sum(fn (TaskTimer $t) => $t->durationSeconds());
        $loggedHours = $totalSeconds / 3600;

        $totalAmount = match ($project->billing_type) {
            BillingType::FixedRate => (float) $project->project_cost,
            BillingType::ProjectHours => round($loggedHours * (float) $project->project_rate_per_hour, 2),
            BillingType::TaskHours => round($tasks->sum(fn ($task) => $task->totalLoggedSeconds() / 3600 * (float) $task->hourly_rate), 2),
        };

        $today = today();
        $daysTotal = $project->deadline ? (int) $project->start_date->diffInDays($project->deadline) : null;
        $daysLeft = $project->deadline ? (int) $today->diffInDays($project->deadline, false) : null;

        $weekStart = $today->copy()->startOfWeek();
        $week = collect(range(0, 6))->map(function (int $offset) use ($weekStart, $timers) {
            $day = $weekStart->copy()->addDays($offset);

            return [
                'date' => $day->toDateString(),
                'seconds' => $timers->filter(fn (TaskTimer $t) => $t->start_time->isSameDay($day))->sum(fn (TaskTimer $t) => $t->durationSeconds()),
            ];
        });

        $byMember = $timers->groupBy('user_id')->map(fn ($memberTimers) => $memberTimers->sum(fn (TaskTimer $t) => $t->durationSeconds()));

        return response()->json(['data' => [
            'progress' => $project->calculatedProgress(),
            'tasks_total' => $tasks->count(),
            'tasks_completed' => $tasks->where('status', TaskStatus::Complete)->count(),
            'tasks_by_status' => collect(TaskStatus::cases())->mapWithKeys(fn (TaskStatus $s) => [$s->value => $tasks->where('status', $s)->count()]),
            'days_total' => $daysTotal,
            'days_left' => $daysLeft,
            'total_logged_seconds' => $totalSeconds,
            'estimated_hours' => $project->estimated_hours !== null ? (float) $project->estimated_hours : null,
            'billable_seconds' => $tasks->where('billable', true)->sum(fn ($task) => $task->totalLoggedSeconds()),
            'total_amount' => $totalAmount,
            'week' => $week,
            'logged_by_member' => $byMember,
        ]]);
    }

    public function note(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        return response()->json(['data' => [
            'content' => $project->notes()->where('user_id', $request->user()->id)->value('content'),
        ]]);
    }

    public function saveNote(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);
        $data = $request->validate(['content' => ['nullable', 'string', 'max:65000']]);

        $project->notes()->updateOrCreate(['user_id' => $request->user()->id], ['content' => $data['content'] ?? null]);

        return response()->json(['message' => 'Note saved.']);
    }

    public function activity(Request $request, Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        return ActivityResource::collection(
            $project->activities()->with('user')->latest('created_at')->latest('id')->paginate($request->integer('per_page', 30))
        );
    }

    /**
     * Every time entry on the project's tasks, newest first; filterable by staff member and task.
     */
    public function timesheets(Request $request, Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        $timers = TaskTimer::query()
            ->whereIn('task_id', $project->tasks()->select('id'))
            ->when($request->integer('user_id'), fn (Builder $q, int $id) => $q->where('user_id', $id))
            ->when($request->integer('task_id'), fn (Builder $q, int $id) => $q->where('task_id', $id))
            ->with(['user', 'task'])
            ->latest('start_time')
            ->paginate($request->integer('per_page', 50));

        return TimerResource::collection($timers);
    }

    /**
     * Gantt rows: milestones with their tasks (Perfex "group by milestones"), or tasks only.
     */
    /**
     * "Invoice project": billable tasks, their timesheets and expenses that can be invoiced.
     */
    public function invoiceData(Project $project, ProjectInvoicer $invoicer): JsonResponse
    {
        $this->authorize('view', $project);
        $this->authorize('create', Invoice::class);

        return response()->json(['data' => $invoicer->preview($project->load('customer'))]);
    }

    /**
     * Create the draft invoice from the chosen tasks and expenses.
     */
    public function invoice(Request $request, Project $project, ProjectInvoicer $invoicer): JsonResponse
    {
        $this->authorize('view', $project);
        $this->authorize('create', Invoice::class);
        $data = $request->validate([
            'type' => ['required', Rule::in(ProjectInvoicer::TYPES)],
            'task_ids' => ['array'],
            'task_ids.*' => ['integer'],
            'expense_ids' => ['array'],
            'expense_ids.*' => ['integer'],
        ]);
        $invoice = $invoicer->invoice($project->load('customer'), $data);

        return response()->json(['data' => ['id' => $invoice->id, 'number' => $invoice->formattedNumber()]], 201);
    }

    /**
     * Perfex project Gantt: tasks grouped by milestone ("Uncategorized" first), by member ("Not
     * assigned" first) or by status, optionally only one status. Groups without tasks are left out.
     */
    public function gantt(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);
        $data = $request->validate([
            'type' => ['nullable', Rule::in(['milestones', 'members', 'status'])],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
        ]);
        $type = $data['type'] ?? 'milestones';
        $user = $request->user();

        $tasks = $project->tasks()->with('assignees.user')
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->orderBy('start_date')->orderBy('id')->get();
        $projectStart = $project->start_date->toDateString();
        $projectEnd = $project->deadline?->toDateString();
        $taskRow = fn (Task $task) => [
            'id' => $task->id,
            'name' => $task->name,
            'start' => $task->start_date->toDateString(),
            'end' => ($task->due_date ?? $task->start_date)->toDateString(),
            'status' => $task->status->value,
            'assignees' => $task->assignees->map(fn ($a) => $a->user?->full_name)->filter()->values(),
            'can_move' => $user->can('update', $task),
        ];

        $groups = match ($type) {
            'members' => collect([['key' => 'member-0', 'name' => 'Not assigned', 'color' => null, 'start' => null, 'end' => null, 'tasks' => $tasks->filter(fn (Task $t) => $t->assignees->isEmpty())]])
                ->concat($project->members()->get()->map(fn ($member) => [
                    'key' => 'member-'.$member->user_id,
                    'name' => User::find($member->user_id)?->full_name ?? 'Former staff',
                    'color' => null, 'start' => null, 'end' => null,
                    'tasks' => $tasks->filter(fn (Task $t) => $t->assignees->contains('user_id', $member->user_id)),
                ])),
            'status' => collect(TaskStatus::cases())->sortBy(fn (TaskStatus $s) => $s->sortOrder())->map(fn (TaskStatus $s) => [
                'key' => 'status-'.$s->value, 'name' => $s->label(), 'color' => $s->color(), 'start' => null, 'end' => null,
                'tasks' => $tasks->where('status', $s),
            ]),
            default => collect([['key' => 'milestone-0', 'name' => 'Uncategorized', 'color' => null, 'start' => null, 'end' => null, 'tasks' => $tasks->whereNull('milestone_id')]])
                ->concat($project->milestones()->orderBy('milestone_order')->orderBy('due_date')->get()->map(fn ($m) => [
                    'key' => 'milestone-'.$m->id, 'name' => $m->name, 'color' => $m->color,
                    'start' => ($m->start_date ?? $m->due_date)?->toDateString(), 'end' => $m->due_date?->toDateString(),
                    'tasks' => $tasks->where('milestone_id', $m->id),
                ])),
        };

        return response()->json(['data' => [
            'project' => ['start' => $projectStart, 'end' => $projectEnd],
            'groups' => $groups->filter(fn ($g) => $g['tasks']->isNotEmpty())->map(function ($g) use ($taskRow) {
                $starts = $g['tasks']->map(fn (Task $t) => $t->start_date->toDateString());
                $ends = $g['tasks']->map(fn (Task $t) => ($t->due_date ?? $t->start_date)->toDateString());

                // A milestone keeps its own dates; other groups span their tasks.
                return [
                    'key' => $g['key'],
                    'name' => $g['name'],
                    'color' => $g['color'],
                    'start' => $g['start'] ?? $starts->min(),
                    'end' => $g['end'] ?? $ends->max(),
                    'tasks' => $g['tasks']->values()->map($taskRow),
                ];
            })->values(),
        ]]);
    }

    /**
     * Staff who may be picked on this project (its members), for assignee pickers.
     */
    public function members(Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        return StaffResource::collection($project->members()->with('user')->get()->pluck('user')->filter()->values());
    }

    private function loadForView(Project $project): Project
    {
        return $project->load(['customer:id,name', 'members.user', 'tags', 'pins', 'creator']);
    }
}
