<?php

namespace App\Policies\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Perfex permission pattern for sales documents: "view" sees all, "view_own" only the user's own
 * (created / assigned); create, edit and delete each need their capability.
 */
trait OwnedDocumentRules
{
    abstract protected function feature(): string;

    abstract protected function isOwn(User $user, Model $document): bool;

    public function viewAny(User $user): bool
    {
        return $user->hasPermission($this->feature(), 'view') || $user->hasPermission($this->feature(), 'view_own');
    }

    public function view(User $user, Model $document): bool
    {
        return $user->hasPermission($this->feature(), 'view')
            || ($user->hasPermission($this->feature(), 'view_own') && $this->isOwn($user, $document));
    }

    public function create(User $user): bool
    {
        return $user->hasPermission($this->feature(), 'create');
    }

    public function update(User $user, Model $document): bool
    {
        return $user->hasPermission($this->feature(), 'edit') && $this->view($user, $document);
    }

    public function delete(User $user, Model $document): bool
    {
        return $user->hasPermission($this->feature(), 'delete') && $this->view($user, $document);
    }
}
