<?php

namespace App\Console\Commands;

use App\Services\HrmsSync;
use Illuminate\Console\Command;
use Throwable;

/**
 * Copies HRMS companies, roles and users into the CRM (scheduled; also run once after install).
 */
class SyncHrmsUsers extends Command
{
    protected $signature = 'hrms:sync';

    protected $description = 'Copy HRMS companies, roles and users into the CRM';

    public function handle(): int
    {
        try {
            $counts = HrmsSync::all();
        } catch (Throwable $e) {
            // HRMS unreachable: the CRM keeps working with the last copy.
            $this->warn('HRMS not reachable: '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info("Synced {$counts['companies']} companies, {$counts['roles']} roles, {$counts['users']} users ({$counts['deactivated']} deactivated).");

        return self::SUCCESS;
    }
}
