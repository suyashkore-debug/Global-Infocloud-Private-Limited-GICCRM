<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Goal extends Model
{
    use BelongsToCompany;

    /** @var array<int, string> Perfex goal types. */
    public const TYPES = [
        1 => 'Achieve Total Income',
        8 => 'Invoiced Amount',
        2 => 'Convert X Leads',
        3 => 'Increase Customer Number (leads conversion excluded)',
        4 => 'Increase Customer Number (leads conversions included)',
        5 => 'Make Contracts By Type (from date added)',
        7 => 'Make Contracts By Type (from contract start date)',
        6 => 'Total estimates converted',
    ];

    protected $fillable = [
        'company_id', 'subject', 'description', 'start_date', 'end_date', 'goal_type', 'contract_type_id', 'achievement',
        'notify_when_fail', 'notify_when_achieve', 'notified', 'staff_id', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'achievement' => 'decimal:2',
            'notify_when_fail' => 'boolean',
            'notify_when_achieve' => 'boolean',
            'notified' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function staff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'staff_id');
    }

    /**
     * @return BelongsTo<ContractType, $this>
     */
    public function contractType(): BelongsTo
    {
        return $this->belongsTo(ContractType::class);
    }
}
