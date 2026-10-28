<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

/**
 * A capability granted to a non-admin user, as in Perfex staff permissions
 * (e.g. feature "projects", capability "create").
 */
class StaffPermission extends Model
{
    use BelongsToCompany;

    /** @var array<string, list<string>> Every feature and the capabilities it can grant. */
    public const AVAILABLE = [
        'projects' => ['view', 'create', 'edit', 'delete'],
        'tasks' => ['view', 'create', 'edit', 'delete'],
        'customers' => ['view', 'create', 'edit', 'delete'],
        'invoices' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'estimates' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'proposals' => ['view_own', 'view', 'create', 'edit', 'delete', 'view_all_templates'],
        'credit_notes' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'expenses' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'contracts' => ['view_own', 'view', 'create', 'edit', 'delete', 'view_all_templates'],
        'leads' => ['view', 'delete'],
        'tickets' => ['view', 'delete'],
        'knowledge_base' => ['view', 'create', 'edit', 'delete'],
        'goals' => ['view', 'create', 'edit', 'delete'],
        'reports' => ['view'],
        'surveys' => ['view', 'create', 'edit', 'delete'],
        'estimate_request' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'purchase_vendors' => ['view', 'create', 'edit', 'delete'],
        'purchase_requests' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'purchase_orders' => ['view_own', 'view', 'create', 'edit', 'delete'],
        'purchase_invoices' => ['view', 'create', 'edit', 'delete'],
        'accounting' => ['view', 'create', 'edit', 'delete'],
        'payments' => ['view', 'create', 'edit', 'delete'],
        'items' => ['view', 'create', 'edit', 'delete'],
    ];

    /**
     * Named explicitly: it is loaded through User (on the "hrms" connection), and a related model
     * without its own connection would otherwise be read from the HRMS database.
     */
    protected $connection = 'mysql';

    protected $fillable = ['company_id', 'user_id', 'feature', 'capability'];
}
