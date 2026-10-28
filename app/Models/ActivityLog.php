<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Utilities → Activity Log (Perfex tblactivity_log).
 */
class ActivityLog extends Model
{
    use BelongsToCompany;

    public const UPDATED_AT = null;

    protected $table = 'activity_log';

    protected $fillable = ['company_id', 'user_id', 'description'];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
