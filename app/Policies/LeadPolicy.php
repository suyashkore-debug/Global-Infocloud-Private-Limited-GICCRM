<?php

namespace App\Policies;

use App\Models\Lead;
use App\Models\User;
use App\Services\Options;

/**
 * Perfex leads: every staff member can add leads and work on the ones assigned to or added by
 * them (and public ones); "view" shows all leads, "delete" allows deleting.
 */
class LeadPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Lead $lead): bool
    {
        // The same rule as the lists (Lead::visibleTo): their own leads, and the others in the
        // pipelines they work in.
        return $user->isAdmin() || (int) $lead->assigned_id === (int) $user->id
            || Lead::query()->visibleTo($user)->whereKey($lead->id)->exists();
    }

    public function create(User $user): bool
    {
        return true;
    }

    /**
     * Settings → Leads "Lock after convert to customer": only admins change a converted lead.
     */
    public function update(User $user, Lead $lead): bool
    {
        if ($lead->customer_id && ! $user->isAdmin() && Options::get('lead_lock_after_convert_to_customer') === '1') {
            return false;
        }

        return $this->view($user, $lead);
    }

    public function delete(User $user, Lead $lead): bool
    {
        return $user->hasPermission('leads', 'delete');
    }
}
