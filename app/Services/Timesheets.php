<?php

namespace App\Services;

use App\Models\TaskTimer;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Logged time of staff members (Perfex staff stats and "My Timesheets").
 */
class Timesheets
{
    /**
     * Total, this / last month and this / last week, in seconds (running timers count up to now).
     *
     * @return array<string, int>
     */
    public static function stats(int $userId): array
    {
        $timers = TaskTimer::whereHas('task')->where('user_id', $userId)->get(['id', 'start_time', 'end_time']);
        $now = CarbonImmutable::now();
        $ranges = [
            'this_month' => [$now->startOfMonth(), $now->endOfMonth()],
            'last_month' => [$now->subMonthNoOverflow()->startOfMonth(), $now->subMonthNoOverflow()->endOfMonth()],
            'this_week' => [$now->startOfWeek(), $now->endOfWeek()],
            'last_week' => [$now->subWeek()->startOfWeek(), $now->subWeek()->endOfWeek()],
        ];

        $stats = ['total' => (int) $timers->sum(fn (TaskTimer $t) => $t->durationSeconds())];
        foreach ($ranges as $key => [$from, $to]) {
            $stats[$key] = (int) $timers->filter(fn (TaskTimer $t) => $t->start_time->between($from, $to))->sum(fn (TaskTimer $t) => $t->durationSeconds());
        }

        return $stats;
    }

    /**
     * The [from, to] dates of a Perfex range filter.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function range(string $range, ?string $from = null, ?string $to = null): array
    {
        $now = CarbonImmutable::now();

        return match ($range) {
            'this_month' => [$now->startOfMonth(), $now->endOfMonth()],
            'last_month' => [$now->subMonthNoOverflow()->startOfMonth(), $now->subMonthNoOverflow()->endOfMonth()],
            'this_week' => [$now->startOfWeek(), $now->endOfWeek()],
            'last_week' => [$now->subWeek()->startOfWeek(), $now->subWeek()->endOfWeek()],
            'period' => [CarbonImmutable::parse($from ?? $now)->startOfDay(), CarbonImmutable::parse($to ?? $now)->endOfDay()],
            default => [$now->startOfDay(), $now->endOfDay()],
        };
    }

    /**
     * Seconds logged per day between two dates, for the chart.
     *
     * @param  Collection<int, TaskTimer>  $timers
     * @return array{labels: array<int, string>, data: array<int, int>}
     */
    public static function perDay(Collection $timers, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $byDay = $timers->groupBy(fn (TaskTimer $t) => $t->start_time->toDateString())->map(fn ($g) => $g->sum(fn (TaskTimer $t) => $t->durationSeconds()));
        $labels = [];
        $data = [];
        for ($day = $from->startOfDay(); $day->lte($to) && count($labels) < 366; $day = $day->addDay()) {
            $labels[] = $day->toDateString();
            $data[] = (int) ($byDay[$day->toDateString()] ?? 0);
        }

        return ['labels' => $labels, 'data' => $data];
    }
}
