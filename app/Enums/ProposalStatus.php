<?php

namespace App\Enums;

/**
 * Proposal statuses as in Perfex (tblproposals.status).
 */
enum ProposalStatus: int
{
    case Open = 1;
    case Declined = 2;
    case Accepted = 3;
    case Sent = 4;
    case Revised = 5;
    case Draft = 6;

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Open',
            self::Declined => 'Declined',
            self::Accepted => 'Accepted',
            self::Sent => 'Sent',
            self::Revised => 'Revised',
            self::Draft => 'Draft',
        };
    }
}
