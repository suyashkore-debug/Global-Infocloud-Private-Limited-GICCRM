<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\PurchaseDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseRequest extends Model
{
    use BelongsToCompany, PurchaseDocument;

    protected $fillable = [
        'company_id', 'number', 'code', 'name', 'description', 'requester_id', 'department', 'project_id', 'currency_id',
        'request_date', 'status', 'subtotal', 'total_tax', 'total', 'hash', 'created_by',
    ];

    protected function casts(): array
    {
        return ['request_date' => 'datetime', 'status' => 'integer'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return HasMany<PurchaseOrder, $this>
     */
    public function orders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }
}
