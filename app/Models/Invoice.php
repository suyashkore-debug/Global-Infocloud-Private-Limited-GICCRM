<?php

namespace App\Models;

use App\Enums\InvoiceStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasSalesItems;
use App\Models\Concerns\HasTags;
use App\Services\Options;
use Database\Factories\InvoiceFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    /** @use HasFactory<InvoiceFactory> */
    use BelongsToCompany, HasFactory, HasSalesItems, HasTags;

    protected $fillable = [
        'company_id', 'customer_id', 'project_id', 'currency_id', 'number', 'prefix', 'number_format', 'date', 'due_date',
        'status', 'subtotal', 'total_tax', 'total', 'adjustment', 'discount_percent', 'discount_total', 'discount_type',
        'show_quantity_as', 'client_note', 'admin_note', 'terms', 'sale_agent_id',
        'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
        'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country',
        'include_shipping', 'show_shipping_on_invoice', 'allowed_payment_modes', 'sent', 'sent_at',
        'cancel_overdue_reminders', 'hash', 'repeat_every', 'recurring_type', 'cycles', 'total_cycles',
        'last_recurring_date', 'recurring_from_id', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => InvoiceStatus::class,
            'date' => 'date',
            'due_date' => 'date',
            'subtotal' => 'decimal:2',
            'total_tax' => 'decimal:2',
            'total' => 'decimal:2',
            'adjustment' => 'decimal:2',
            'discount_percent' => 'decimal:2',
            'discount_total' => 'decimal:2',
            'include_shipping' => 'boolean',
            'show_shipping_on_invoice' => 'boolean',
            'allowed_payment_modes' => 'array',
            'sent' => 'boolean',
            'sent_at' => 'datetime',
            'cancel_overdue_reminders' => 'boolean',
            'last_recurring_date' => 'date',
        ];
    }

    /**
     * Invoices a user may see: all with "view", else their own (created or sale agent) with "view_own".
     *
     * @param  Builder<Invoice>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('invoices', 'view')) {
            return;
        }
        if (! $user->hasPermission('invoices', 'view_own')) {
            $query->whereRaw('1 = 0');

            return;
        }
        $query->where(fn ($q) => $q->where('created_by', $user->id)->orWhere('sale_agent_id', $user->id));
    }

    /**
     * Perfex number: prefix + padded number, in the format chosen in Setup; drafts read "PREFIX-DRAFT".
     */
    public function formattedNumber(): string
    {
        if ($this->status === InvoiceStatus::Draft) {
            return $this->prefix.'DRAFT';
        }

        return Options::formatNumber((int) $this->number, (int) $this->number_format, (string) $this->prefix, $this->date, $this->company_id);
    }

    public function amountPaid(): float
    {
        return (float) $this->payments->sum('amount');
    }

    /**
     * Credit applied from credit notes; Perfex counts it like a payment.
     */
    public function amountCredited(): float
    {
        return (float) $this->appliedCredits->sum('amount');
    }

    public function amountDue(): float
    {
        return round((float) $this->total - $this->amountPaid() - $this->amountCredited(), 2);
    }

    /**
     * @return HasMany<AppliedCredit, $this>
     */
    public function appliedCredits(): HasMany
    {
        return $this->hasMany(AppliedCredit::class);
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<Currency, $this>
     */
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function saleAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sale_agent_id');
    }

    /**
     * @return HasMany<Payment, $this>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('date')->orderBy('id');
    }
}
