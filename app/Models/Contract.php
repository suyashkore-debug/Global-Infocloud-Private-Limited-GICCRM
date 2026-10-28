<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Support\RichText;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Contract extends Model
{
    /**
     * Formatted content from the editor is cleaned when saved; old plain text stays as it is.
     *
     * @return Attribute<string|null, string|null>
     */
    protected function content(): Attribute
    {
        return Attribute::make(set: fn (?string $value) => RichText::clean($value));
    }

    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'subject', 'description', 'content', 'customer_id', 'contract_type_id', 'project_id', 'start_date',
        'end_date', 'contract_value', 'trash', 'not_visible_to_client', 'signed', 'marked_as_signed', 'signer_name',
        'signed_at', 'expiry_notified', 'hash', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'contract_value' => 'decimal:2',
            'trash' => 'boolean',
            'not_visible_to_client' => 'boolean',
            'signed' => 'boolean',
            'marked_as_signed' => 'boolean',
            'signed_at' => 'datetime',
            'expiry_notified' => 'boolean',
        ];
    }

    /**
     * @param  Builder<Contract>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('contracts', 'view')) {
            return;
        }
        $user->hasPermission('contracts', 'view_own') ? $query->where('created_by', $user->id) : $query->whereRaw('1 = 0');
    }

    public function isExpired(): bool
    {
        return $this->end_date !== null && $this->end_date->lt(today());
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return BelongsTo<ContractType, $this>
     */
    public function type(): BelongsTo
    {
        return $this->belongsTo(ContractType::class, 'contract_type_id');
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return HasMany<ContractRenewal, $this>
     */
    public function renewals(): HasMany
    {
        return $this->hasMany(ContractRenewal::class)->latest();
    }

    /**
     * @return HasMany<ContractComment, $this>
     */
    public function comments(): HasMany
    {
        return $this->hasMany(ContractComment::class)->oldest();
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }
}
