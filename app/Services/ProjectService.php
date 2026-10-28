<?php

namespace App\Services;

use App\Enums\BillingType;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\Attachment;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Project actions with the side effects Perfex has: members, tags, activity log, notifications,
 * finishing tasks and timers.
 */
class ProjectService
{
    public function __construct(private Notifier $notifier, private TaskService $tasks) {}

    /**
     * @param  array<string, mixed>  $data  validated project fields plus members[] and tags[]
     */
    public function create(array $data): Project
    {
        return DB::transaction(function () use ($data) {
            $project = Project::create([
                ...$this->projectFields($data),
                'created_by' => Auth::id(),
            ]);

            $project->syncTagNames($data['tags'] ?? []);
            $this->syncMembers($project, $data['members'] ?? []);
            $project->logActivity('project_activity_created');

            return $project;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Project $project, array $data): Project
    {
        return DB::transaction(function () use ($project, $data) {
            $oldStatus = $project->status;
            $fields = $this->projectFields($data);
            $newStatus = ProjectStatus::from((int) $fields['status']);

            if ($oldStatus === ProjectStatus::Finished && $newStatus !== ProjectStatus::Finished) {
                $fields['date_finished'] = null;
            } elseif ($oldStatus !== ProjectStatus::Finished && $newStatus === ProjectStatus::Finished) {
                $fields['date_finished'] = now();
            }

            $project->update($fields);

            if (array_key_exists('tags', $data)) {
                $project->syncTagNames($data['tags'] ?? []);
            }
            if (array_key_exists('members', $data)) {
                $this->syncMembers($project, $data['members'] ?? []);
            }
            if ($newStatus === ProjectStatus::Finished && ! empty($data['mark_all_tasks_complete'])) {
                $this->completeAllTasks($project);
            }

            $project->logActivity('project_activity_updated');

            return $project;
        });
    }

    /**
     * "Mark as" from the project page, with Perfex's options.
     */
    public function changeStatus(Project $project, ProjectStatus $status, bool $markAllTasksComplete = false, bool $notifyMembers = false): void
    {
        $oldStatus = $project->status;
        if ($oldStatus === $status) {
            return;
        }

        DB::transaction(function () use ($project, $status, $oldStatus, $markAllTasksComplete, $notifyMembers) {
            $project->update([
                'status' => $status,
                'date_finished' => $status === ProjectStatus::Finished ? now() : null,
            ]);

            if ($status === ProjectStatus::Finished) {
                $project->logActivity('project_marked_as_finished');
            } else {
                $project->logActivity('project_activity_status_updated', $status->label());
            }

            if ($notifyMembers) {
                $this->notifier->notify(
                    $project->members()->pluck('user_id'),
                    "changed the status of project {$project->name} from {$oldStatus->label()} to {$status->label()}",
                    "/projects/{$project->id}",
                );
            }

            if ($markAllTasksComplete) {
                $this->completeAllTasks($project);
            }
        });
    }

    /**
     * Copy a project as Perfex does: new dates keep each task and milestone at the same offset
     * from the project start.
     *
     * @param  array<string, mixed>  $options
     */
    public function copy(Project $source, array $options): Project
    {
        return DB::transaction(function () use ($source, $options) {
            $newStart = CarbonImmutable::parse($options['start_date']);
            $oldStart = CarbonImmutable::parse($source->start_date);

            $project = $source->replicate(['progress', 'date_finished']);
            $project->fill([
                'name' => ($options['name'] ?? null) ?: $source->name,
                'customer_id' => $options['customer_id'],
                'start_date' => $newStart,
                'deadline' => $options['deadline'] ?? null,
                'status' => $newStart->isAfter(today()) ? ProjectStatus::NotStarted : ProjectStatus::InProgress,
                'progress' => 0,
                'created_by' => Auth::id(),
            ]);
            $project->save();

            $project->syncTagNames($source->tags->pluck('name')->all());

            if (! empty($options['copy_members'])) {
                $this->syncMembers($project, $source->members()->pluck('user_id')->all(), logActivity: false);
            }

            $milestoneMap = [];
            if (! empty($options['copy_milestones'])) {
                foreach ($source->milestones as $milestone) {
                    $start = $milestone->start_date ?? $milestone->due_date;
                    $newMilestoneStart = $newStart->addDays((int) $oldStart->diffInDays($start, true));
                    $copy = $project->milestones()->create([
                        'name' => $milestone->name,
                        'description' => $milestone->description,
                        'color' => $milestone->color,
                        'milestone_order' => $milestone->milestone_order,
                        'start_date' => $newMilestoneStart,
                        'due_date' => $newMilestoneStart->addDays((int) CarbonImmutable::parse($start)->diffInDays($milestone->due_date, true)),
                    ]);
                    $milestoneMap[$milestone->id] = $copy->id;
                }
            }

            if (! empty($options['copy_tasks'])) {
                $status = TaskStatus::from((int) ($options['task_status'] ?? TaskStatus::NotStarted->value));
                foreach ($source->tasks()->with(['assignees', 'followers', 'checklistItems', 'tags'])->get() as $task) {
                    $taskStart = $newStart->addDays((int) $oldStart->diffInDays($task->start_date, true));
                    $this->tasks->copy($task, [
                        'project_id' => $project->id,
                        'milestone_id' => $milestoneMap[$task->milestone_id] ?? null,
                        'start_date' => $taskStart,
                        'due_date' => $task->due_date ? $taskStart->addDays((int) $task->start_date->diffInDays($task->due_date, true)) : null,
                        'status' => $status,
                    ], [
                        'assignees' => ! empty($options['copy_task_assignees']),
                        'followers' => ! empty($options['copy_task_followers']),
                        'checklist' => ! empty($options['copy_task_checklist']),
                    ]);
                }
            }

            $project->logActivity('project_activity_created');

            return $project;
        });
    }

    public function delete(Project $project): void
    {
        DB::transaction(function () use ($project) {
            // Through the model so stored files are removed from disk too.
            Attachment::where('project_id', $project->id)->get()->each->delete();
            $project->delete();
        });
    }

    public function togglePin(Project $project): bool
    {
        $pin = $project->pins()->where('user_id', Auth::id())->first();
        if ($pin) {
            $pin->delete();

            return false;
        }

        $project->pins()->create(['user_id' => Auth::id()]);

        return true;
    }

    /**
     * @param  array<int, int|string>  $userIds
     */
    public function syncMembers(Project $project, array $userIds, bool $logActivity = true): void
    {
        $wanted = collect($userIds)->map(fn ($id) => (int) $id)->unique();
        $current = $project->members()->pluck('user_id');

        foreach ($current->diff($wanted) as $userId) {
            $project->members()->where('user_id', $userId)->delete();
            if ($logActivity) {
                $project->logActivity('project_activity_removed_team_member', $this->userName($userId));
            }
        }

        $added = $wanted->diff($current);
        foreach ($added as $userId) {
            $project->members()->create(['user_id' => $userId]);
            if ($logActivity) {
                $project->logActivity('project_activity_added_team_member', $this->userName($userId));
            }
        }

        $this->notifier->notify($added, "added you as a member of project {$project->name}", "/projects/{$project->id}");
        Emails::toStaff('staff-added-as-project-member', (int) $project->company_id, $added, Emails::project($project), $project);
    }

    private function completeAllTasks(Project $project): void
    {
        Task::where('project_id', $project->id)
            ->where('status', '!=', TaskStatus::Complete)
            ->update(['status' => TaskStatus::Complete, 'date_finished' => now()]);

        TaskTimer::whereIn('task_id', $project->tasks()->select('id'))->whereNull('end_time')->update(['end_time' => now()]);
        $project->logActivity('project_activity_marked_all_tasks_as_complete');
    }

    /**
     * Fields as Perfex stores them: only the money field of the chosen billing type is kept.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function projectFields(array $data): array
    {
        $fields = Arr::only($data, [
            'customer_id', 'name', 'description', 'workspace_link', 'status', 'billing_type', 'project_cost',
            'project_rate_per_hour', 'estimated_hours', 'customer_settings', 'start_date', 'deadline', 'progress', 'progress_from_tasks',
        ]);

        $billing = BillingType::from((int) $fields['billing_type']);
        $fields['project_cost'] = $billing === BillingType::FixedRate ? ($fields['project_cost'] ?? null) : null;
        $fields['project_rate_per_hour'] = $billing === BillingType::ProjectHours ? ($fields['project_rate_per_hour'] ?? null) : null;
        $fields['progress_from_tasks'] = (bool) ($fields['progress_from_tasks'] ?? false);
        $fields['progress'] = $fields['progress_from_tasks'] ? 0 : (int) ($fields['progress'] ?? 0);

        return $fields;
    }

    private function userName(int $userId): string
    {
        return (string) (User::find($userId)?->full_name ?? "#{$userId}");
    }
}
