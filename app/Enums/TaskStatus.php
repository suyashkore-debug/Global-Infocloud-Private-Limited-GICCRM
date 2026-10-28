<?php

namespace App\Enums;

/**
 * Task statuses, ids and colours as in Perfex (tbltasks.status), plus GIC's own
 * "Old Task Pending For Feedback" (id 50, added in GICHRMS my_functions_helper).
 */
enum TaskStatus: int
{
    case NotStarted = 1;
    case AwaitingFeedback = 2;
    case Testing = 3;
    case InProgress = 4;
    case Complete = 5;
    case OldPendingFeedback = 50;

    public function label(): string
    {
        return match ($this) {
            self::NotStarted => 'Not Started',
            self::AwaitingFeedback => 'Awaiting Feedback',
            self::Testing => 'Testing',
            self::InProgress => 'In Progress',
            self::Complete => 'Complete',
            self::OldPendingFeedback => 'Old Task Pending For Feedback',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::NotStarted => '#64748b',
            self::AwaitingFeedback => '#84cc16',
            self::Testing => '#0284c7',
            self::InProgress => '#3b82f6',
            self::Complete => '#22c55e',
            self::OldPendingFeedback => '#989898',
        };
    }

    /** Board / list order: Not Started, In Progress, Testing, Awaiting Feedback, Old Pending, Complete. */
    public function sortOrder(): int
    {
        return match ($this) {
            self::NotStarted => 1,
            self::InProgress => 2,
            self::Testing => 3,
            self::AwaitingFeedback => 4,
            self::OldPendingFeedback => 10,
            self::Complete => 100,
        };
    }
}
