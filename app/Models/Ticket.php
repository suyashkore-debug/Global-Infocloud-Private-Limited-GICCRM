<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasTags;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\DB;

class Ticket extends Model
{
    use BelongsToCompany, HasTags;

    protected $fillable = [
        'company_id', 'subject', 'message', 'customer_id', 'contact_id', 'name', 'email', 'cc', 'support_department_id',
        'ticket_priority_id', 'ticket_status_id', 'ticket_service_id', 'project_id', 'assigned_id', 'last_reply_at',
        'admin_read', 'ticket_key', 'merged_into_id', 'created_by',
    ];

    protected function casts(): array
    {
        return ['last_reply_at' => 'datetime', 'admin_read' => 'boolean'];
    }

    /**
     * Perfex: staff see tickets of the departments they belong to (or all with "view" / as admin);
     * a ticket assigned to them is always visible.
     *
     * @param  Builder<Ticket>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('tickets', 'view')) {
            return;
        }
        $departments = DB::table('support_department_user')->where('user_id', $user->id)->pluck('support_department_id');
        $query->where(fn ($q) => $q->whereIn('support_department_id', $departments)->orWhere('assigned_id', $user->id));
    }

    /**
     * Who opened it: the contact's name, or the name / email typed in.
     */
    public function requesterName(): string
    {
        return $this->contact ? $this->contact->fullName() : (string) $this->name;
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return BelongsTo<Contact, $this>
     */
    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    /**
     * @return BelongsTo<SupportDepartment, $this>
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(SupportDepartment::class, 'support_department_id');
    }

    /**
     * @return BelongsTo<TicketPriority, $this>
     */
    public function priority(): BelongsTo
    {
        return $this->belongsTo(TicketPriority::class, 'ticket_priority_id');
    }

    /**
     * @return BelongsTo<TicketStatus, $this>
     */
    public function status(): BelongsTo
    {
        return $this->belongsTo(TicketStatus::class, 'ticket_status_id');
    }

    /**
     * @return BelongsTo<TicketService, $this>
     */
    public function service(): BelongsTo
    {
        return $this->belongsTo(TicketService::class, 'ticket_service_id');
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assigned(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_id');
    }

    /**
     * @return HasMany<TicketReply, $this>
     */
    public function replies(): HasMany
    {
        return $this->hasMany(TicketReply::class)->oldest();
    }

    /**
     * @return MorphMany<Note, $this>
     */
    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable')->latest();
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }
}
