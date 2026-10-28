<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JournalEntry extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'number', 'journal_date', 'reference', 'description', 'amount', 'created_by'];

    protected function casts(): array
    {
        return ['journal_date' => 'date'];
    }

    /**
     * @return HasMany<AccountTransaction, $this>
     */
    public function lines(): HasMany
    {
        return $this->hasMany(AccountTransaction::class, 'rel_id')->where('rel_type', 'journal_entry')->orderBy('id');
    }
}
