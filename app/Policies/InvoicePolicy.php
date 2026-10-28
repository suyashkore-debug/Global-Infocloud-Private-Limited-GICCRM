<?php

namespace App\Policies;

use App\Models\Invoice;
use App\Models\User;

/**
 * Perfex invoice permissions: "view" sees every invoice, "view_own" only the ones the user
 * created or is the sale agent of.
 */
class InvoicePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('invoices', 'view') || $user->hasPermission('invoices', 'view_own');
    }

    public function view(User $user, Invoice $invoice): bool
    {
        return $user->hasPermission('invoices', 'view')
            || ($user->hasPermission('invoices', 'view_own') && $this->isOwn($user, $invoice));
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('invoices', 'create');
    }

    public function update(User $user, Invoice $invoice): bool
    {
        return $user->hasPermission('invoices', 'edit') && $this->view($user, $invoice);
    }

    public function delete(User $user, Invoice $invoice): bool
    {
        return $user->hasPermission('invoices', 'delete') && $this->view($user, $invoice);
    }

    public function recordPayment(User $user, Invoice $invoice): bool
    {
        return $user->hasPermission('payments', 'create') && $this->view($user, $invoice);
    }

    private function isOwn(User $user, Invoice $invoice): bool
    {
        return (int) $invoice->created_by === (int) $user->id || (int) $invoice->sale_agent_id === (int) $user->id;
    }
}
