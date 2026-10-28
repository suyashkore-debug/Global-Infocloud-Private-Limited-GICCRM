<?php

namespace App\Enums;

/**
 * Project statuses, ids and colours as in Perfex (tblprojects.status).
 */
enum ProjectStatus: int
{
    case NotStarted = 1;
    case InProgress = 2;
    case OnHold = 3;
    case Finished = 4;
    case Cancelled = 5;

    public function label(): string
    {
        return match ($this) {
            self::NotStarted => 'Not Started',
            self::InProgress => 'In Progress',
            self::OnHold => 'On Hold',
            self::Finished => 'Finished',
            self::Cancelled => 'Cancelled',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::NotStarted => '#475569',
            self::InProgress => '#2563eb',
            self::OnHold => '#f97316',
            self::Finished => '#16a34a',
            self::Cancelled => '#94a3b8',
        };
    }

    /** Statuses shown by default in the projects list (finished and cancelled are filtered out). */
    public function shownByDefault(): bool
    {
        return in_array($this, [self::NotStarted, self::InProgress, self::OnHold], true);
    }

    public function sortOrder(): int
    {
        return match ($this) {
            self::NotStarted => 1,
            self::InProgress => 2,
            self::OnHold => 3,
            self::Cancelled => 4,
            self::Finished => 100,
        };
    }
}
