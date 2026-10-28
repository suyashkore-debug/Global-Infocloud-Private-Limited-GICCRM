<?php

namespace App\Console\Commands;

use App\Models\TaskTimer;
use App\Services\Options;
use Illuminate\Console\Command;

/**
 * Perfex cron "Automatically stop task timers after (hours)": a task timer left running longer
 * than the company's limit is stopped at start + limit, so a forgotten timer never logs more.
 * Timers started without a task are left alone, as in Perfex.
 */
class StopLongTimers extends Command
{
    protected $signature = 'timers:auto-stop';

    protected $description = 'Stop task timers that have run longer than each company\'s limit';

    public function handle(): int
    {
        $stopped = 0;
        $companies = TaskTimer::withoutGlobalScopes()->whereNull('end_time')->whereNotNull('task_id')->distinct()->pluck('company_id');

        foreach ($companies as $companyId) {
            $hours = (int) Options::get('automatically_stop_task_timer_after_hours', (int) $companyId);
            if ($hours <= 0) {
                continue;
            }
            TaskTimer::withoutGlobalScopes()
                ->where('company_id', $companyId)
                ->whereNull('end_time')
                ->whereNotNull('task_id')
                ->where('start_time', '<=', now()->subHours($hours))
                ->get()
                ->each(function (TaskTimer $timer) use ($hours, &$stopped) {
                    $timer->update(['end_time' => $timer->start_time->copy()->addHours($hours)]);
                    $stopped++;
                });
        }

        $this->info("Stopped {$stopped} timer(s).");

        return self::SUCCESS;
    }
}
