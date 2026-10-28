<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Expense extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'expense_category_id', 'name', 'amount', 'currency_id', 'tax_id', 'tax2_id', 'date', 'customer_id',
        'project_id', 'billable', 'invoice_id', 'payment_mode_id', 'reference_no', 'note', 'repeat_every', 'recurring_type',
        'cycles', 'total_cycles', 'last_recurring_date', 'recurring_from_id', 'create_invoice_billable', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'date' => 'date',
            'billable' => 'boolean',
            'create_invoice_billable' => 'boolean',
            'last_recurring_date' => 'date',
        ];
    }

    /**
     * @param  Builder<Expense>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('expenses', 'view')) {
            return;
        }
        $user->hasPermission('expenses', 'view_own') ? $query->where('created_by', $user->id) : $query->whereRaw('1 = 0');
    }

    /**
     * Amount with its taxes (Perfex shows "Amount (incl. tax)").
     */
    public function totalWithTax(): float
    {
        $rate = (float) ($this->tax?->rate ?? 0) + (float) ($this->tax2?->rate ?? 0);

        return round((float) $this->amount * (1 + $rate / 100), 2);
    }

    /**
     * @return BelongsTo<ExpenseCategory, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
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
     * @return BelongsTo<Tax, $this>
     */
    public function tax(): BelongsTo
    {
        return $this->belongsTo(Tax::class);
    }

    /**
     * @return BelongsTo<Tax, $this>
     */
    public function tax2(): BelongsTo
    {
        return $this->belongsTo(Tax::class, 'tax2_id');
    }

    /**
     * @return BelongsTo<PaymentMode, $this>
     */
    public function paymentMode(): BelongsTo
    {
        return $this->belongsTo(PaymentMode::class);
    }

    /**
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /**
     * The receipt and other files.
     *
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }
}
