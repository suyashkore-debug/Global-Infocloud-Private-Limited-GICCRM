<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A staff note on any record (Perfex tblnotes: leads, customers, contracts, ...).
 */
class Note extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'notable_type', 'notable_id', 'description', 'contacted_at', 'created_by'];

    protected function casts(): array
    {
        return ['contacted_at' => 'datetime'];
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function notable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
