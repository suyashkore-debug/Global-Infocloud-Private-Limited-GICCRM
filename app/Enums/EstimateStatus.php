<?php

namespace App\Enums;

/**
 * Estimate statuses as in Perfex (tblestimates.status).
 */
enum EstimateStatus: int
{
    case Draft = 1;
    case Sent = 2;
    case Declined = 3;
    case Accepted = 4;
    case Expired = 5;

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Sent => 'Sent',
            self::Declined => 'Declined',
            self::Accepted => 'Accepted',
            self::Expired => 'Expired',
        };
    }
}
