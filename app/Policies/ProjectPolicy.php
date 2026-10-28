<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

/**
 * Perfex project rules: admins and holders of a permission act on every project; other staff
 * see and work in the projects they are members of.
 */
class ProjectPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Project $project): bool
    {
        return $user->hasPermission('projects', 'view') || $project->hasMember($user);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('projects', 'create');
    }

    public function update(User $user, Project $project): bool
    {
        return $user->hasPermission('projects', 'edit');
    }

    public function delete(User $user, Project $project): bool
    {
        return $user->hasPermission('projects', 'delete');
    }

    /**
     * Members (and editors) upload files, open discussions and write notes in a project.
     */
    public function contribute(User $user, Project $project): bool
    {
        return $this->update($user, $project) || $project->hasMember($user);
    }
}
