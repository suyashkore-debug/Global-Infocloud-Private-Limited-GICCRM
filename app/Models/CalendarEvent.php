<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A calendar event (Perfex tblevents): private to its creator unless public.
 */
class CalendarEvent extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'title', 'description', 'start', 'end', 'public', 'color', 'reminder_before', 'reminder_before_type', 'start_notified', 'user_id'];

    protected function casts(): array
    {
        return ['start' => 'datetime', 'end' => 'datetime', 'public' => 'boolean', 'start_notified' => 'boolean'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
