<?php

namespace App\Enums;

/**
 * Credit note statuses as in Perfex: open while credit remains, closed when it is all used or
 * refunded, void when cancelled.
 */
enum CreditNoteStatus: int
{
    case Open = 1;
    case Closed = 2;
    case Void = 3;

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Open',
            self::Closed => 'Closed',
            self::Void => 'Void',
        };
    }
}
