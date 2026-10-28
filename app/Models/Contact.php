<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A customer's contact person (Perfex tblcontacts); the primary one receives documents by default.
 */
class Contact extends Model
{
    protected $fillable = [
        'customer_id', 'is_primary', 'first_name', 'last_name', 'email', 'phone', 'title', 'active',
        'invoice_emails', 'estimate_emails', 'credit_note_emails', 'contract_emails', 'task_emails', 'project_emails', 'ticket_emails',
        'password', 'last_login_at', 'last_password_change_at', 'permissions',
    ];

    /** Perfex contact permissions for the customers area. */
    public const PORTAL_PERMISSIONS = ['invoices', 'estimates', 'contracts', 'proposals', 'support', 'projects'];

    protected $hidden = ['password'];

    protected $appends = ['has_password'];

    /**
     * Can the contact log in to the customers area yet?
     */
    public function getHasPasswordAttribute(): bool
    {
        return ! empty($this->attributes['password']);
    }

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'active' => 'boolean',
            'invoice_emails' => 'boolean',
            'estimate_emails' => 'boolean',
            'credit_note_emails' => 'boolean',
            'contract_emails' => 'boolean',
            'task_emails' => 'boolean',
            'project_emails' => 'boolean',
            'ticket_emails' => 'boolean',
            'password' => 'hashed',
            'permissions' => 'array',
            'last_login_at' => 'datetime',
            'last_password_change_at' => 'datetime',
        ];
    }

    /**
     * May this contact use a part of the customers area? Contacts without explicit
     * permissions have them all (Perfex ticks every permission for a new contact).
     */
    public function canPortal(string $permission): bool
    {
        return $this->permissions === null || in_array($permission, $this->permissions, true);
    }

    public function fullName(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
