<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An account in the chart of accounts (Perfex accounting).
 */
class Account extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'key_name', 'number', 'name', 'parent_id', 'account_type_id', 'account_detail_type_id', 'description',
        'balance', 'balance_as_of', 'active', 'bank_account', 'bank_name', 'created_by',
    ];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'balance_as_of' => 'date', 'account_type_id' => 'integer'];
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'parent_id');
    }

    /**
     * @return HasMany<Account, $this>
     */
    public function children(): HasMany
    {
        return $this->hasMany(Account::class, 'parent_id');
    }

    /**
     * @return BelongsTo<AccountDetailType, $this>
     */
    public function detailType(): BelongsTo
    {
        return $this->belongsTo(AccountDetailType::class, 'account_detail_type_id');
    }

    /**
     * @return HasMany<AccountTransaction, $this>
     */
    public function transactions(): HasMany
    {
        return $this->hasMany(AccountTransaction::class);
    }
}
