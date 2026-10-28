<?php

namespace App\Policies;

use App\Models\NewsfeedPost;
use App\Models\User;

class NewsfeedPostPolicy
{
    public function view(User $user, NewsfeedPost $post): bool
    {
        return $post->isVisibleTo($user);
    }

    /**
     * Only the author or an admin may delete a post (Perfex).
     */
    public function delete(User $user, NewsfeedPost $post): bool
    {
        return (int) $post->user_id === (int) $user->id || $user->isAdmin();
    }

    public function update(User $user, NewsfeedPost $post): bool
    {
        return $this->delete($user, $post);
    }

    public function pin(User $user): bool
    {
        return $user->isAdmin();
    }
}
