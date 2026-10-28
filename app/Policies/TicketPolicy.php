<?php

namespace App\Policies;

use App\Models\Ticket;
use App\Models\User;

/**
 * Perfex support: staff work on the tickets of their departments (and the ones assigned to them);
 * "view" shows every ticket and "delete" allows deleting.
 */
class TicketPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Ticket $ticket): bool
    {
        return Ticket::query()->whereKey($ticket->id)->visibleTo($user)->exists();
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Ticket $ticket): bool
    {
        return $this->view($user, $ticket);
    }

    public function delete(User $user, Ticket $ticket): bool
    {
        return $user->hasPermission('tickets', 'delete');
    }
}
