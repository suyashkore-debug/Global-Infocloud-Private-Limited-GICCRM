<?php

namespace App\Models;

use App\Jobs\SendPushNotification;
use App\Models\Concerns\BelongsToCompany;
use App\Services\Realtime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNotification extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'user_id', 'from_user_id', 'description', 'link', 'read_at'];

    protected static function booted(): void
    {
        // The bell updates at once (live), not on its next minute poll.
        static::created(function (AppNotification $n) {
            Realtime::toUsers([$n->user_id], 'notification');
            // And on the person's phone / browser, when they turned notifications on.
            SendPushNotification::toUsers([$n->user_id], [
                'title' => 'GIC Folks CRM',
                'body' => trim(($n->fromUser?->full_name ?? 'Reminder').' '.$n->description),
                'url' => $n->link ?: '/',
                'tag' => 'notification-'.$n->id,
            ]);
        });
    }

    protected function casts(): array
    {
        return ['read_at' => 'datetime'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function fromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }
}
