<?php

namespace App\Support;

use App\Services\Options;

/**
 * Perfex task_timer_round(): Settings → Tasks "Round off task timer" applied to logged time
 * (task totals, timesheet reports, invoicing). The timers themselves keep their exact times.
 */
class TimerRounding
{
    /** Perfex's choices for "in multiples of … minutes". */
    public const MINUTES = [5, 10, 15, 20, 25, 30, 35, 40, 45];

    public static function round(int $seconds, ?int $companyId = null): int
    {
        $mode = (int) Options::get('round_off_task_timer_option', $companyId);
        $minutes = (int) Options::get('round_off_task_timer_time', $companyId);
        if ($mode === 0 || $minutes <= 0) {
            return $seconds;
        }
        $step = $minutes * 60;

        return (int) match ($mode) {
            1 => ceil($seconds / $step) * $step,
            2 => floor($seconds / $step) * $step,
            3 => round($seconds / $step) * $step,
            default => $seconds,
        };
    }
}
