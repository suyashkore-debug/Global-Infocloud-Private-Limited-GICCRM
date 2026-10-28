<?php

namespace App\Enums;

/**
 * How a project is billed, as in Perfex: a fixed cost, project hours at one rate, or task hours
 * at each task's own rate.
 */
enum BillingType: int
{
    case FixedRate = 1;
    case ProjectHours = 2;
    case TaskHours = 3;

    public function label(): string
    {
        return match ($this) {
            self::FixedRate => 'Fixed Rate',
            self::ProjectHours => 'Project Hours',
            self::TaskHours => 'Task Hours',
        };
    }
}
