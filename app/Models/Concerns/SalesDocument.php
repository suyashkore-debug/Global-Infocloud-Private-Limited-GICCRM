<?php

namespace App\Models\Concerns;

use App\Models\Currency;
use App\Models\Customer;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Relations shared by estimates and credit notes (and invoices' twins).
 */
trait SalesDocument
{
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
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Money casts shared by every sales document.
     *
     * @return array<string, string>
     */
    protected function moneyCasts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'total_tax' => 'decimal:2',
            'total' => 'decimal:2',
            'adjustment' => 'decimal:2',
            'discount_percent' => 'decimal:2',
            'discount_total' => 'decimal:2',
        ];
    }
}
