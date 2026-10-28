<?php

namespace App\Models;

use App\Support\CurrentCompany;
use App\Support\TimerRounding;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A timesheet entry: a started timer (no end time yet) or a finished / manually logged period.
 * A timer started from the header has no task until it is stopped.
 */
class TaskTimer extends Model
{
    protected $fillable = ['company_id', 'task_id', 'user_id', 'start_time', 'end_time', 'hourly_rate', 'note'];

    protected static function booted(): void
    {
        static::creating(fn (TaskTimer $timer) => $timer->company_id ??= CurrentCompany::id());
    }

    protected function casts(): array
    {
        return [
            'start_time' => 'datetime',
            'end_time' => 'datetime',
            'hourly_rate' => 'decimal:2',
        ];
    }

    public function isRunning(): bool
    {
        return $this->end_time === null;
    }

    public function durationSeconds(): int
    {
        return max(0, (int) $this->start_time->diffInSeconds($this->end_time ?? now(), true));
    }

    /** The duration after Settings → Tasks "Round off task timer" (Perfex task_timer_round). */
    public function roundedSeconds(): int
    {
        return TimerRounding::round($this->durationSeconds(), $this->company_id ? (int) $this->company_id : null);
    }

    /**
     * @return BelongsTo<Task, $this>
     */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
