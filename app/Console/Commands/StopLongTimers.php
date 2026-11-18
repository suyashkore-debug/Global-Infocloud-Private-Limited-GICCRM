<?php

namespace App\Console\Commands;

use App\Models\Task;
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
        // Each task's workspace has its own limit.
        $timers = TaskTimer::withoutGlobalScopes()->whereNull('end_time')->whereNotNull('task_id')->where('start_time', '<=', now()->subHour())->get();
        $workspaces = Task::withoutGlobalScopes()->whereIn('id', $timers->pluck('task_id')->unique())->pluck('workspace_id', 'id');
        $timers->each(function (TaskTimer $timer) use ($workspaces, &$stopped) {
            $workspace = $workspaces[$timer->task_id] ?? null;
            $hours = (int) Options::within($workspace ? (int) $workspace : null, fn () => Options::get('automatically_stop_task_timer_after_hours', (int) $timer->company_id));
            if ($hours > 0 && $timer->start_time->lte(now()->subHours($hours))) {
                $timer->update(['end_time' => $timer->start_time->copy()->addHours($hours)]);
                $stopped++;
            }
        });

        $this->info("Stopped {$stopped} timer(s).");

        return self::SUCCESS;
    }
}
