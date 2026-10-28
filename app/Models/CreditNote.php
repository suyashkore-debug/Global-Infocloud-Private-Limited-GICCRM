<?php

namespace App\Models;

use App\Enums\CreditNoteStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasSalesItems;
use App\Models\Concerns\SalesDocument;
use App\Services\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CreditNote extends Model
{
    use BelongsToCompany, HasSalesItems, SalesDocument;

    protected $fillable = [
        'company_id', 'customer_id', 'project_id', 'currency_id', 'subtotal', 'total_tax', 'total', 'adjustment', 'discount_percent', 'discount_total', 'discount_type', 'show_quantity_as', 'created_by',
        'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country', 'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country', 'include_shipping', 'show_shipping',
        'number', 'prefix', 'number_format', 'date', 'status', 'client_note', 'admin_note', 'terms', 'reference_no',
    ];

    protected function casts(): array
    {
        return [
            ...$this->moneyCasts(),
            'status' => CreditNoteStatus::class,
            'date' => 'date',
            'include_shipping' => 'boolean',
            'show_shipping' => 'boolean',
        ];
    }

    /**
     * @param  Builder<CreditNote>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('credit_notes', 'view')) {
            return;
        }
        $user->hasPermission('credit_notes', 'view_own') ? $query->where('created_by', $user->id) : $query->whereRaw('1 = 0');
    }

    public function formattedNumber(): string
    {
        return Options::formatNumber((int) $this->number, (int) $this->number_format, (string) $this->prefix, $this->date, $this->company_id);
    }

    /**
     * Credit still available: total minus what was applied to invoices and refunded.
     */
    public function remainingCredits(): float
    {
        return round((float) $this->total - (float) $this->appliedCredits()->sum('amount') - (float) $this->refunds()->sum('amount'), 2);
    }

    /**
     * @return HasMany<AppliedCredit, $this>
     */
    public function appliedCredits(): HasMany
    {
        return $this->hasMany(AppliedCredit::class);
    }

    /**
     * @return HasMany<CreditNoteRefund, $this>
     */
    public function refunds(): HasMany
    {
        return $this->hasMany(CreditNoteRefund::class);
    }
}
