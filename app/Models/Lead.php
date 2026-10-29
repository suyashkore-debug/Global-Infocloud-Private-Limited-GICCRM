<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasTags;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Lead extends Model
{
    use BelongsToCompany, HasTags;

    /** Qualification criteria, in star order: a lead meeting n of them is rated n stars. */
    public const QUALIFICATION = ['industry', 'company_size', 'business_need', 'decision_maker', 'timeline'];

    protected $fillable = [
        'company_id', 'name', 'title', 'company', 'description', 'email', 'phone', 'website', 'address', 'city', 'state',
        'zip', 'country', 'lead_status_id', 'lead_source_id', 'assigned_id', 'assigned_at', 'lead_value', 'qualification', 'is_public',
        'lost', 'junk', 'last_contact_at', 'last_status_change_at', 'customer_id', 'converted_at', 'lead_order', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'date',
            'lead_value' => 'decimal:2',
            'qualification' => 'array',
            'is_public' => 'boolean',
            'lost' => 'boolean',
            'junk' => 'boolean',
            'last_contact_at' => 'datetime',
            'last_status_change_at' => 'datetime',
            'converted_at' => 'datetime',
        ];
    }

    /**
     * Perfex lead visibility: "view" sees all; otherwise leads assigned to or added by the user,
     * plus public leads.
     *
     * @param  Builder<Lead>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('leads', 'view')) {
            return;
        }
        $query->where(fn ($q) => $q->where('assigned_id', $user->id)->orWhere('created_by', $user->id)->orWhere('is_public', true));
    }

    /**
     * The star rating: how many qualification criteria the lead meets.
     */
    public function rating(): int
    {
        return count(array_intersect(self::QUALIFICATION, (array) $this->qualification));
    }

    public function logActivity(string $description, bool $custom = false): void
    {
        $this->activities()->create(['user_id' => auth()->id(), 'description' => $description, 'custom' => $custom]);
    }

    /**
     * @return BelongsTo<LeadStatus, $this>
     */
    public function status(): BelongsTo
    {
        return $this->belongsTo(LeadStatus::class, 'lead_status_id');
    }

    /**
     * @return BelongsTo<LeadSource, $this>
     */
    public function source(): BelongsTo
    {
        return $this->belongsTo(LeadSource::class, 'lead_source_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assigned(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_id');
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return HasMany<LeadActivity, $this>
     */
    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class)->latest('created_at')->latest('id');
    }

    /**
     * @return HasMany<LeadCall, $this>
     */
    public function calls(): HasMany
    {
        return $this->hasMany(LeadCall::class)->latest('called_at')->latest('id');
    }

    /**
     * @return HasMany<Proposal, $this>
     */
    public function proposals(): HasMany
    {
        return $this->hasMany(Proposal::class);
    }

    /**
     * @return MorphMany<Note, $this>
     */
    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable')->latest();
    }

    /**
     * @return MorphMany<Reminder, $this>
     */
    public function reminders(): MorphMany
    {
        return $this->morphMany(Reminder::class, 'remindable')->orderBy('remind_at');
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }
}
