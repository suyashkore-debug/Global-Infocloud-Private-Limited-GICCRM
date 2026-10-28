<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractRenewal extends Model
{
    protected $fillable = ['contract_id', 'old_start_date', 'new_start_date', 'old_end_date', 'new_end_date', 'old_value', 'new_value', 'renewed_by'];

    protected function casts(): array
    {
        return ['old_start_date' => 'date', 'new_start_date' => 'date', 'old_end_date' => 'date', 'new_end_date' => 'date'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function renewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'renewed_by');
    }

    /**
     * @return BelongsTo<Contract, $this>
     */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }
}
