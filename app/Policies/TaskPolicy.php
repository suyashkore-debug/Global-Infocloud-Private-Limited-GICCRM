<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;

/**
 * Perfex task rules: "view" shows every task, otherwise a task is visible to its assignees,
 * followers, creator and project members, or when public. Creators may edit and delete their
 * own tasks; assignees may change status, tick checklist items and log time.
 */
class TaskPolicy
{
    public function view(User $user, Task $task): bool
    {
        return Task::query()->whereKey($task->id)->visibleTo($user)->exists();
    }

    public function create(User $user, ?Project $project = null): bool
    {
        if ($project && ! $user->can('view', $project)) {
            return false;
        }

        return $user->hasPermission('tasks', 'create');
    }

    public function update(User $user, Task $task): bool
    {
        return $user->hasPermission('tasks', 'edit') || $task->isCreator($user);
    }

    public function delete(User $user, Task $task): bool
    {
        return $user->hasPermission('tasks', 'delete') || $task->isCreator($user);
    }

    /**
     * Change status, tick checklist items, manage the checklist.
     */
    public function work(User $user, Task $task): bool
    {
        return $this->update($user, $task) || $task->isAssignee($user);
    }

    /**
     * Only assignees start timers on a task, as in Perfex.
     */
    /**
     * Assignees log time; not on a task that is already invoiced (Perfex "billed").
     */
    public function trackTime(User $user, Task $task): bool
    {
        return $task->isAssignee($user) && $task->invoice_id === null;
    }

    public function comment(User $user, Task $task): bool
    {
        return $this->view($user, $task);
    }
}
