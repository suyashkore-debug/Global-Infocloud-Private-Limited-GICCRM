<?php

namespace App\Console\Commands;

use App\Services\Backups;
use Illuminate\Console\Command;
use Throwable;

/**
 * Database backup: `backup:run` makes one now; `backup:run --auto` (hourly from the scheduler)
 * follows Setup → Backup (on/off, every N days, hour of day, keep N days).
 */
class RunBackup extends Command
{
    protected $signature = 'backup:run {--auto : Only when the automatic backup is due}';

    protected $description = 'Back up the database to storage/app/backups';

    public function handle(): int
    {
        try {
            $name = $this->option('auto') ? Backups::runAutomatic() : Backups::create();
        } catch (Throwable $e) {
            report($e);
            $this->error($e->getMessage());

            return self::FAILURE;
        }
        $this->info($name ? "Backup created: {$name}" : 'No automatic backup due.');

        return self::SUCCESS;
    }
}
