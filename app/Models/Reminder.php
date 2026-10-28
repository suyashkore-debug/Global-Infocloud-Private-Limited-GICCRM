<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * "Set reminder" on any record (Perfex tblreminders); turns into a notification when due.
 */
class Reminder extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'remindable_type', 'remindable_id', 'user_id', 'remind_at', 'description', 'notify_by_email', 'is_notified', 'created_by'];

    protected function casts(): array
    {
        return ['remind_at' => 'datetime', 'notify_by_email' => 'boolean', 'is_notified' => 'boolean'];
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function remindable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
