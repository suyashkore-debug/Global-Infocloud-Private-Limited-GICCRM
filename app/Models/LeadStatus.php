<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadStatus extends Model
{
    use BelongsToCompany;

    /** On reaching a status that moves leads on: who the lead is assigned to. */
    public const MOVE_ASSIGN = ['keep', 'team', 'user'];

    protected $fillable = ['company_id', 'pipeline_id', 'name', 'status_order', 'color', 'is_default', 'notify_lead', 'move_to_status_id', 'move_assign', 'move_assign_user_id'];

    protected static function booted(): void
    {
        // A new status without a pipeline goes into the company's default one.
        static::creating(function (LeadStatus $status) {
            $status->pipeline_id ??= LeadPipeline::withoutGlobalScopes()->where('company_id', $status->company_id)
                ->orderByDesc('is_default')->orderBy('sort_order')->value('id');
        });
    }

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'notify_lead' => 'boolean'];
    }

    /**
     * Only the statuses of the workspace picked in the header (all when the person has one).
     *
     * @param  \Illuminate\Database\Eloquent\Builder<LeadStatus>  $query
     */
    public function scopeInWorkspace(\Illuminate\Database\Eloquent\Builder $query, User $user): void
    {
        if ($workspace = LeadPipeline::current($user)) {
            $query->where('pipeline_id', $workspace->id);
        }
    }

    /**
     * @return BelongsTo<LeadPipeline, $this>
     */
    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(LeadPipeline::class, 'pipeline_id');
    }
}
