<?php

namespace App\Policies;

use App\Models\ChatMessage;
use App\Models\User;

/**
 * Chat files are reached through their message: only the people in that conversation see them,
 * and only the sender removes them.
 */
class ChatMessagePolicy
{
    public function view(User $user, ChatMessage $message): bool
    {
        return $message->involves($user);
    }

    public function update(User $user, ChatMessage $message): bool
    {
        return (int) $message->sender_id === (int) $user->id;
    }
}
