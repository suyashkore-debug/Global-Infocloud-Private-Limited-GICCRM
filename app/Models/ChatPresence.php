<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A staff member's chat status (online, away, busy, offline), when the chat last saw them, and
 * their chat look (light / dark theme and the colour of their own messages).
 */
class ChatPresence extends Model
{
    public const STATUSES = ['online', 'away', 'busy', 'offline'];

    /** Seconds without a heartbeat after which someone shows as offline. */
    public const ONLINE_WINDOW = 90;

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    public const THEMES = ['light', 'dark'];

    protected $fillable = ['user_id', 'status', 'theme', 'color', 'last_seen_at'];

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime'];
    }

    /**
     * What others see: the chosen status while the user is around, offline otherwise.
     */
    public function visibleStatus(): string
    {
        $recent = $this->last_seen_at && $this->last_seen_at->gt(now()->subSeconds(self::ONLINE_WINDOW));

        return $recent ? $this->status : 'offline';
    }
}
