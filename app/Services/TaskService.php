<?php

namespace App\Services;

use App\Enums\TaskStatus;
use App\Models\ChecklistTemplate;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\TaskTimer;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Task actions with Perfex's side effects: project activity log, notifications to assignees and
 * followers, timers stopped on completion.
 */
class TaskService
{
    public function __construct(private Notifier $notifier) {}

    /**
     * @param  array<string, mixed>  $data  validated task fields plus assignees[], followers[], tags[], checklist_templates[]
     */
    public function create(array $data): Task
    {
        return DB::transaction(function () use ($data) {
            $fields = $this->taskFields($data);
            // Perfex "auto" default status: started today or earlier → In Progress.
            $fields['status'] ??= Carbon::parse($fields['start_date'])->isAfter(today())
                ? TaskStatus::NotStarted
                : TaskStatus::InProgress;

            $task = Task::create([...$fields, 'created_by' => Auth::id()]);

            $task->syncTagNames($data['tags'] ?? []);
            foreach (array_values($data['checklist_templates'] ?? []) as $order => $templateId) {
                if ($template = ChecklistTemplate::find($templateId)) {
                    $task->checklistItems()->create(['description' => $template->description, 'list_order' => $order, 'created_by' => Auth::id()]);
                }
            }
            foreach ($data['assignees'] ?? [] as $userId) {
                $this->addAssignee($task, (int) $userId);
            }
            foreach ($data['followers'] ?? [] as $userId) {
                $this->addFollower($task, (int) $userId);
            }

            return $task;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Task $task, array $data): Task
    {
        return DB::transaction(function () use ($task, $data) {
            $fields = $this->taskFields($data);
            unset($fields['status']);

            // Turning recurring off resets its counters, as in Perfex.
            if ($task->repeat_every && empty($fields['repeat_every'])) {
                $fields += ['cycles' => 0, 'total_cycles' => 0, 'last_recurring_date' => null];
            }

            $task->update($fields);

            if (array_key_exists('tags', $data)) {
                $task->syncTagNames($data['tags'] ?? []);
            }
            foreach ($data['checklist_templates'] ?? [] as $templateId) {
                if ($template = ChecklistTemplate::find($templateId)) {
                    $task->checklistItems()->create([
                        'description' => $template->description,
                        'list_order' => (int) $task->checklistItems()->max('list_order') + 1,
                        'created_by' => Auth::id(),
                    ]);
                }
            }

            return $task;
        });
    }

    /**
     * Perfex mark_as: completing stamps date_finished and stops running timers; moving a
     * completed task back clears it.
     */
    public function changeStatus(Task $task, TaskStatus $status): void
    {
        if ($task->status === $status) {
            return;
        }

        $wasComplete = $task->status === TaskStatus::Complete;

        DB::transaction(function () use ($task, $status, $wasComplete) {
            $task->update([
                'status' => $status,
                'date_finished' => $status === TaskStatus::Complete ? now() : null,
            ]);

            if ($status === TaskStatus::Complete) {
                $task->timers()->whereNull('end_time')->update(['end_time' => now()]);
                $task->project?->logActivity('project_activity_task_marked_complete', $task->name);
                $this->notifyResponsible($task, "marked task {$task->name} as complete", 'task-status-change-to-staff');
            } elseif ($wasComplete) {
                $task->project?->logActivity('project_activity_task_unmarked_complete', $task->name);
                $this->notifyResponsible($task, "unmarked task {$task->name} as complete", 'task-status-change-to-staff');
            } else {
                $task->project?->logActivity('not_project_activity_task_status_changed', "{$task->name} - {$status->label()}");
                $this->notifyResponsible($task, "changed the status of task {$task->name} to {$status->label()}", 'task-status-change-to-staff');
            }
        });
    }

    public function addAssignee(Task $task, int $userId): void
    {
        if ($task->assignees()->where('user_id', $userId)->exists()) {
            return;
        }

        $task->assignees()->create(['user_id' => $userId, 'assigned_by' => Auth::id()]);
        $task->unsetRelation('assignees');

        $this->notifier->notify([$userId], "assigned you to task {$task->name}", $this->link($task));
        Emails::toStaff('task-assigned', (int) $task->company_id, [$userId], $this->emailFields($task), $task);
        $task->project?->logActivity('project_activity_new_task_assignee', $task->name.' - '.$this->userName($userId));
    }

    public function removeAssignee(Task $task, int $userId): void
    {
        if ($task->assignees()->where('user_id', $userId)->delete()) {
            $task->unsetRelation('assignees');
            $task->project?->logActivity('project_activity_task_assignee_removed', $task->name.' - '.$this->userName($userId));
        }
    }

    public function addFollower(Task $task, int $userId): void
    {
        if ($task->followers()->where('user_id', $userId)->exists()) {
            return;
        }

        $task->followers()->create(['user_id' => $userId]);
        $task->unsetRelation('followers');
        $this->notifier->notify([$userId], "added you as a follower on task {$task->name}", $this->link($task));
        Emails::toStaff('task-added-as-follower', (int) $task->company_id, [$userId], $this->emailFields($task), $task);
    }

    public function removeFollower(Task $task, int $userId): void
    {
        $task->followers()->where('user_id', $userId)->delete();
        $task->unsetRelation('followers');
    }

    /**
     * Start a timer for the current user, on a task or (from the header) without one. Like
     * Perfex, depending on the Tasks settings the user's other task timers stop and a Not
     * Started task moves to In Progress.
     */
    public function startTimer(?Task $task, ?string $note = null): TaskTimer
    {
        return DB::transaction(function () use ($task, $note) {
            if (Options::get('auto_stop_tasks_timers_on_new_timer') === '1') {
                TaskTimer::where('user_id', Auth::id())->whereNull('end_time')->whereNotNull('task_id')->update(['end_time' => now()]);
            }

            $timer = TaskTimer::create([
                'task_id' => $task?->id,
                'company_id' => $task?->company_id,
                'user_id' => Auth::id(),
                'start_time' => now(),
                'hourly_rate' => $task->hourly_rate ?? 0,
                'note' => $note,
            ]);

            if ($task && $task->status === TaskStatus::NotStarted && Options::get('timer_started_change_status_in_progress') === '1') {
                $this->changeStatus($task, TaskStatus::InProgress);
            }

            return $timer;
        });
    }

    /**
     * Stop a timer with an optional note. A timer started without a task gets its task now.
     */
    public function stopTimer(TaskTimer $timer, ?string $note = null, ?Task $task = null): void
    {
        if (! $timer->isRunning()) {
            return;
        }

        $timer->update(array_filter([
            'end_time' => now(),
            'note' => $note ?: $timer->note,
            'task_id' => $task?->id,
            'company_id' => $task?->company_id,
            'hourly_rate' => $task?->hourly_rate,
        ], fn ($v) => $v !== null));
        $this->logTimesheetActivity($timer->load('task'));
    }

    /**
     * Manually log time (Perfex "Timesheet" form): either a start/end pair or a h:mm duration
     * ending now.
     *
     * @param  array{user_id?: int|null, start_time?: string|null, end_time?: string|null, duration?: string|null, note?: string|null}  $data
     */
    public function logTime(Task $task, array $data, ?TaskTimer $timer = null): TaskTimer
    {
        if (! empty($data['duration'])) {
            [$hours, $minutes] = array_map('intval', explode(':', $data['duration']) + [1 => 0]);
            $end = now();
            $start = now()->subHours($hours)->subMinutes($minutes);
        } else {
            $start = Carbon::parse($data['start_time']);
            $end = Carbon::parse($data['end_time']);
        }

        if ($end->lessThan($start)) {
            throw ValidationException::withMessages(['end_time' => 'End time must be after the start time.']);
        }

        $userId = (int) ($data['user_id'] ?? Auth::id());

        if ($timer) {
            $timer->update(['user_id' => $userId, 'start_time' => $start, 'end_time' => $end, 'note' => $data['note'] ?? null]);

            return $timer;
        }

        $task->timers()->where('user_id', $userId)->whereNull('end_time')->update(['end_time' => now()]);
        $timer = $task->timers()->create([
            'user_id' => $userId,
            'start_time' => $start,
            'end_time' => $end,
            'hourly_rate' => $task->hourly_rate,
            'note' => $data['note'] ?? null,
        ]);
        $this->logTimesheetActivity($timer);

        return $timer;
    }

    public function deleteTimer(TaskTimer $timer): void
    {
        $task = $timer->task;
        $timer->delete();
        $task->project?->logActivity('project_activity_task_timesheet_deleted', $task->name);
    }

    public function addComment(Task $task, string $content): TaskComment
    {
        $comment = $task->comments()->create(['user_id' => Auth::id(), 'content' => $content]);
        $task->project?->logActivity('project_activity_new_task_comment', $task->name);

        $mentioned = $this->mentionedUserIds($content);
        $commentText = ['task_comment' => preg_replace('/@\[([^\]]+)\]\(\d+\)/', '@$1', $content)];
        if ($mentioned) {
            $this->notifier->notify($mentioned, "mentioned you in a comment on task {$task->name}", $this->link($task));
            Emails::toStaff('task-commented', (int) $task->company_id, $mentioned, [...$this->emailFields($task), ...$commentText], $task);
        } else {
            $this->notifyResponsible($task, "commented on task {$task->name}", 'task-commented', $commentText);
        }

        return $comment;
    }

    /**
     * Copy a task (used by "Copy task" and when copying a project).
     *
     * @param  array<string, mixed>  $overrides
     * @param  array{assignees?: bool, followers?: bool, checklist?: bool}  $include
     */
    public function copy(Task $source, array $overrides = [], array $include = []): Task
    {
        return DB::transaction(function () use ($source, $overrides, $include) {
            $task = $source->replicate(['date_finished', 'last_recurring_date', 'total_cycles', 'recurring_from_id']);
            $task->fill([...$overrides, 'created_by' => Auth::id(), 'total_cycles' => 0]);
            if (($task->status ?? null) === TaskStatus::Complete) {
                $task->date_finished = now();
            }
            $task->save();

            $task->syncTagNames($source->tags->pluck('name')->all());

            if ($include['assignees'] ?? false) {
                foreach ($source->assignees as $assignee) {
                    $this->addAssignee($task, $assignee->user_id);
                }
            }
            if ($include['followers'] ?? false) {
                foreach ($source->followers as $follower) {
                    $this->addFollower($task, $follower->user_id);
                }
            }
            if ($include['checklist'] ?? false) {
                foreach ($source->checklistItems as $item) {
                    $task->checklistItems()->create([
                        'description' => $item->description,
                        'list_order' => $item->list_order,
                        'assigned_to' => $item->assigned_to,
                        'created_by' => Auth::id(),
                    ]);
                }
            }

            return $task;
        });
    }

    public function delete(Task $task): void
    {
        DB::transaction(function () use ($task) {
            $task->attachments()->get()->each->delete();
            $task->project?->logActivity('project_activity_task_deleted', $task->name);
            $task->delete();
        });
    }

    /**
     * Assignees and followers hear about changes, as in Perfex.
     */
    public function notifyResponsible(Task $task, string $description, ?string $emailTemplate = null, array $emailFields = []): void
    {
        $userIds = $task->assignees()->pluck('user_id')->merge($task->followers()->pluck('user_id'));
        $this->notifier->notify($userIds, $description, $this->link($task));
        if ($emailTemplate) {
            Emails::toStaff($emailTemplate, (int) $task->company_id, $userIds, [...$this->emailFields($task), ...$emailFields], $task);
        }
    }

    /**
     * Task merge fields plus who did it ({task_user_take_action}).
     *
     * @return array<string, string|null>
     */
    private function emailFields(Task $task): array
    {
        return [...Emails::task($task), 'task_user_take_action' => Auth::user()?->full_name];
    }

    /**
     * @return array<int, int>
     */
    private function mentionedUserIds(string $content): array
    {
        // Comments are plain text; a mention is written as @[Full Name](user id).
        preg_match_all('/@\[[^\]]*\]\((\d+)\)/', $content, $matches);

        return array_map('intval', array_unique($matches[1]));
    }

    private function logTimesheetActivity(TaskTimer $timer): void
    {
        $task = $timer->task;
        $task->project?->logActivity('project_activity_recorded_timesheet', gmdate('H:i', $timer->durationSeconds()).' - '.$task->name);
    }

    private function link(Task $task): string
    {
        return $task->project_id ? "/projects/{$task->project_id}?tab=tasks&task={$task->id}" : "/tasks?task={$task->id}";
    }

    private function userName(int $userId): string
    {
        return (string) (User::find($userId)?->full_name ?? "#{$userId}");
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function taskFields(array $data): array
    {
        $fields = Arr::only($data, [
            'project_id', 'milestone_id', 'name', 'description', 'priority', 'status', 'start_date', 'due_date',
            'is_public', 'visible_to_client', 'billable', 'hourly_rate', 'repeat_every', 'recurring_type', 'cycles',
        ]);

        if (empty($fields['project_id'])) {
            $fields['milestone_id'] = null;
        }
        if (array_key_exists('repeat_every', $fields) && empty($fields['repeat_every'])) {
            $fields['repeat_every'] = null;
            $fields['recurring_type'] = null;
        }

        return $fields;
    }
}
