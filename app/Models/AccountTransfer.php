<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountTransfer extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'from_account_id', 'to_account_id', 'amount', 'date', 'description', 'created_by'];

    protected function casts(): array
    {
        return ['date' => 'date'];
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function from(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'from_account_id');
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function to(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'to_account_id');
    }
}
