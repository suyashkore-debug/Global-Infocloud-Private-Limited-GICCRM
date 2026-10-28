<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

/**
 * Who must approve purchase requests / orders (Perfex purchase "Approval setting").
 */
class PurchaseApprovalSetting extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'related', 'approver_ids'];

    protected function casts(): array
    {
        return ['approver_ids' => 'array'];
    }
}
