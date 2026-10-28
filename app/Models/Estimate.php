<?php

namespace App\Models;

use App\Enums\EstimateStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasSalesItems;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\SalesDocument;
use App\Services\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Estimate extends Model
{
    use BelongsToCompany, HasSalesItems, HasTags, SalesDocument;

    protected $fillable = [
        'company_id', 'customer_id', 'project_id', 'currency_id', 'subtotal', 'total_tax', 'total', 'adjustment', 'discount_percent', 'discount_total', 'discount_type', 'show_quantity_as', 'created_by',
        'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country', 'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country', 'include_shipping', 'show_shipping',
        'number', 'prefix', 'number_format', 'date', 'expiry_date', 'status', 'client_note', 'admin_note', 'terms',
        'reference_no', 'sale_agent_id', 'invoice_id', 'invoiced_at', 'sent', 'sent_at', 'pipeline_order', 'hash',
    ];

    protected function casts(): array
    {
        return [
            ...$this->moneyCasts(),
            'status' => EstimateStatus::class,
            'date' => 'date',
            'expiry_date' => 'date',
            'invoiced_at' => 'datetime',
            'sent' => 'boolean',
            'sent_at' => 'datetime',
            'include_shipping' => 'boolean',
            'show_shipping' => 'boolean',
        ];
    }

    /**
     * Perfex "view" sees every estimate, "view_own" the ones created by or assigned to the user.
     *
     * @param  Builder<Estimate>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('estimates', 'view')) {
            return;
        }
        if (! $user->hasPermission('estimates', 'view_own')) {
            $query->whereRaw('1 = 0');

            return;
        }
        $query->where(fn ($q) => $q->where('created_by', $user->id)->orWhere('sale_agent_id', $user->id));
    }

    public function isOwnedBy(User $user): bool
    {
        return (int) $this->created_by === (int) $user->id || (int) $this->sale_agent_id === (int) $user->id;
    }

    public function formattedNumber(): string
    {
        return Options::formatNumber((int) $this->number, (int) $this->number_format, (string) $this->prefix, $this->date, $this->company_id);
    }

    /**
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function saleAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sale_agent_id');
    }
}
