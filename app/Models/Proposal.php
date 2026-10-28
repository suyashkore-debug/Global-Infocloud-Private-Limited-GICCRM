<?php

namespace App\Models;

use App\Enums\ProposalStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasSalesItems;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\SalesDocument;
use App\Services\Options;
use App\Support\RichText;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Proposal extends Model
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

    use BelongsToCompany, HasSalesItems, HasTags, SalesDocument;

    protected $fillable = [
        'company_id', 'customer_id', 'project_id', 'currency_id', 'subtotal', 'total_tax', 'total', 'adjustment', 'discount_percent', 'discount_total', 'discount_type', 'show_quantity_as', 'created_by',
        'subject', 'content', 'lead_id', 'proposal_to', 'address', 'city', 'state', 'zip', 'country', 'email', 'phone', 'date',
        'open_till', 'status', 'assigned_id', 'allow_comments', 'estimate_id', 'invoice_id', 'converted_at',
        'pipeline_order', 'hash',
    ];

    protected function casts(): array
    {
        return [
            ...$this->moneyCasts(),
            'status' => ProposalStatus::class,
            'date' => 'date',
            'open_till' => 'date',
            'converted_at' => 'datetime',
            'allow_comments' => 'boolean',
        ];
    }

    /**
     * @param  Builder<Proposal>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('proposals', 'view')) {
            return;
        }
        if (! $user->hasPermission('proposals', 'view_own')) {
            $query->whereRaw('1 = 0');

            return;
        }
        $query->where(fn ($q) => $q->where('created_by', $user->id)->orWhere('assigned_id', $user->id));
    }

    public function isOwnedBy(User $user): bool
    {
        return (int) $this->created_by === (int) $user->id || (int) $this->assigned_id === (int) $user->id;
    }

    /**
     * Perfex format_proposal_number(): prefix + padded id.
     */
    public function formattedNumber(): string
    {
        return Options::get('proposal_number_prefix', $this->company_id).str_pad((string) $this->id, max(1, (int) Options::get('number_padding_prefixes', $this->company_id)), '0', STR_PAD_LEFT);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assigned(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_id');
    }

    /**
     * @return BelongsTo<Lead, $this>
     */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /**
     * @return BelongsTo<Estimate, $this>
     */
    public function estimate(): BelongsTo
    {
        return $this->belongsTo(Estimate::class);
    }

    /**
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
