<?php

namespace App\Policies;

use App\Models\PurchaseInvoice;
use App\Models\User;

/**
 * Used for the bill attachments (download / delete go through AttachmentController).
 */
class PurchaseInvoicePolicy
{
    public function view(User $user, PurchaseInvoice $invoice): bool
    {
        return $user->hasPermission('purchase_invoices', 'view');
    }

    public function update(User $user, PurchaseInvoice $invoice): bool
    {
        return $user->hasPermission('purchase_invoices', 'edit');
    }

    public function delete(User $user, PurchaseInvoice $invoice): bool
    {
        return $user->hasPermission('purchase_invoices', 'delete');
    }
}
