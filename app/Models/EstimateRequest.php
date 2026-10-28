<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasTags;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A request for an estimate submitted through a public web form.
 */
class EstimateRequest extends Model
{
    use BelongsToCompany, HasTags;

    protected $fillable = [
        'company_id', 'email', 'submission', 'estimate_request_form_id', 'estimate_request_status_id', 'assigned_id',
        'last_status_change_at', 'date_estimated', 'estimate_id', 'proposal_id',
    ];

    protected function casts(): array
    {
        return [
            'submission' => 'array',
            'last_status_change_at' => 'datetime',
            'date_estimated' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<EstimateRequestForm, $this>
     */
    public function form(): BelongsTo
    {
        return $this->belongsTo(EstimateRequestForm::class, 'estimate_request_form_id');
    }

    /**
     * @return BelongsTo<EstimateRequestStatus, $this>
     */
    public function status(): BelongsTo
    {
        return $this->belongsTo(EstimateRequestStatus::class, 'estimate_request_status_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assigned(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_id');
    }

    /**
     * @return BelongsTo<Estimate, $this>
     */
    public function estimate(): BelongsTo
    {
        return $this->belongsTo(Estimate::class);
    }

    /**
     * @return BelongsTo<Proposal, $this>
     */
    public function proposal(): BelongsTo
    {
        return $this->belongsTo(Proposal::class);
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }

    /**
     * A submitted value by field name (e.g. "company", "phonenumber").
     */
    public function value(string $name): ?string
    {
        foreach ($this->submission ?? [] as $field) {
            if (($field['name'] ?? null) === $name) {
                return is_array($field['value'] ?? null) ? implode(', ', $field['value']) : ($field['value'] ?? null);
            }
        }

        return null;
    }
}
