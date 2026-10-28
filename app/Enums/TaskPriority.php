<?php

namespace App\Enums;

enum TaskPriority: int
{
    case Low = 1;
    case Medium = 2;
    case High = 3;
    case Urgent = 4;

    public function label(): string
    {
        return match ($this) {
            self::Low => 'Low',
            self::Medium => 'Medium',
            self::High => 'High',
            self::Urgent => 'Urgent',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Low => '#777777',
            self::Medium => '#03a9f4',
            self::High => '#ff6f00',
            self::Urgent => '#fc2d42',
        };
    }
}
