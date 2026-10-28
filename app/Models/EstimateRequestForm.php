<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A public web form ("quote form") whose submissions become estimate requests.
 */
class EstimateRequestForm extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'form_key', 'name', 'fields', 'estimate_request_status_id', 'responsible_id', 'submit_btn_name',
        'success_submit_msg', 'notify_request_submitted', 'notify_type', 'notify_ids', 'active', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'fields' => 'array',
            'notify_ids' => 'array',
            'notify_request_submitted' => 'boolean',
            'active' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<EstimateRequestStatus, $this>
     */
    public function status(): BelongsTo
    {
        return $this->belongsTo(EstimateRequestStatus::class, 'estimate_request_status_id');
    }

    /**
     * @return HasMany<EstimateRequest, $this>
     */
    public function requests(): HasMany
    {
        return $this->hasMany(EstimateRequest::class);
    }

    /**
     * Staff to notify about a new submission: chosen staff, members of chosen HRMS roles, or the
     * form's responsible person.
     *
     * @return array<int, int>
     */
    public function notifyUserIds(): array
    {
        if (! $this->notify_request_submitted) {
            return [];
        }
        $ids = array_map('intval', $this->notify_ids ?? []);

        return match ($this->notify_type) {
            'specific_staff' => User::where('company_id', $this->company_id)->whereIn('id', $ids)->pluck('id')->all(),
            'roles' => User::where('company_id', $this->company_id)->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $ids))->pluck('id')->all(),
            default => array_filter([(int) $this->responsible_id]),
        };
    }
}
