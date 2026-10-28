<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A call with a lead, logged from the lead's Call tab.
 */
class LeadCall extends Model
{
    use BelongsToCompany;

    /** Outcomes staff pick when logging a call by hand => label. */
    public const OUTCOMES = [
        'answered' => 'Answered',
        'no_answer' => 'No answer',
        'busy' => 'Busy',
        'switched_off' => 'Switched off / not reachable',
        'wrong_number' => 'Wrong number',
        'callback' => 'Asked to call back',
    ];

    /** Outcomes only calls through the calling provider get. */
    public const PROVIDER_OUTCOMES = [
        'calling' => 'Calling…',
        'missed' => 'Missed call',
        'failed' => 'Call failed',
    ];

    protected $fillable = [
        'company_id', 'lead_id', 'user_id', 'source', 'provider_call_id', 'provider_status', 'lead_number', 'agent_number',
        'direction', 'outcome', 'called_at', 'duration_minutes', 'talk_seconds', 'recording_url', 'notes',
    ];

    /**
     * @return array<string, string>
     */
    public static function labels(): array
    {
        return self::OUTCOMES + self::PROVIDER_OUTCOMES;
    }

    protected function casts(): array
    {
        return [
            'called_at' => 'datetime',
            'duration_minutes' => 'integer',
            'talk_seconds' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Lead, $this>
     */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
