<?php

namespace App\Enums;

/**
 * Invoice statuses, ids and label colours as in Perfex (tblinvoices.status).
 */
enum InvoiceStatus: int
{
    case Unpaid = 1;
    case Paid = 2;
    case PartiallyPaid = 3;
    case Overdue = 4;
    case Cancelled = 5;
    case Draft = 6;

    public function label(): string
    {
        return match ($this) {
            self::Unpaid => 'Unpaid',
            self::Paid => 'Paid',
            self::PartiallyPaid => 'Partially Paid',
            self::Overdue => 'Overdue',
            self::Cancelled => 'Cancelled',
            self::Draft => 'Draft',
        };
    }
}
