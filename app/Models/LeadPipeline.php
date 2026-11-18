<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Services\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A lead pipeline (TeleCRM's "workspace"): its own statuses and team. Staff see the pipelines
 * whose team they are in (a pipeline without a team is everyone's); administrators see all.
 */
class LeadPipeline extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'color', 'sort_order', 'is_default', 'member_ids', 'last_assigned_id'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'member_ids' => 'array'];
    }

    protected static function booted(): void
    {
        // Settings are looked up per workspace (Options): a new, removed or default one changes that.
        static::saved(fn () => Options::forgetWorkspaces());
        static::deleted(fn () => Options::forgetWorkspaces());
    }

    /**
     * @return HasMany<LeadStatus, $this>
     */
    public function statuses(): HasMany
    {
        return $this->hasMany(LeadStatus::class, 'pipeline_id');
    }

    /**
     * The pipelines a staff member works in.
     *
     * @param  Builder<LeadPipeline>  $query
     */
    public function scopeAccessibleTo(Builder $query, User $user): void
    {
        if ($user->isAdmin()) {
            return;
        }
        $query->where(fn (Builder $q) => $q->whereNull('member_ids')->orWhereJsonLength('member_ids', 0)->orWhereJsonContains('member_ids', (int) $user->id));
    }

    /**
     * The ids of the statuses in the pipelines a staff member works in (a subquery), and statuses
     * not in any pipeline.
     *
     * @return Builder<LeadStatus>
     */
    public static function statusIdsFor(User $user): Builder
    {
        return LeadStatus::query()->select('id')->where(fn (Builder $q) => $q
            ->whereNull('pipeline_id')
            ->orWhereIn('pipeline_id', self::query()->select('id')->accessibleTo($user)));
    }

    /**
     * The workspaces listed for a staff member: their team's, plus those holding leads given to
     * them (administrators: all), in order.
     *
     * @return \Illuminate\Support\Collection<int, LeadPipeline>
     */
    public static function listFor(User $user)
    {
        $own = $user->isAdmin() ? collect() : LeadStatus::whereIn('id', Lead::query()->where('assigned_id', $user->id)->select('lead_status_id'))->distinct()->pluck('pipeline_id');

        return self::query()
            ->unless($user->isAdmin(), fn (Builder $q) => $q->where(fn (Builder $q) => $q->where(fn (Builder $q) => $q->accessibleTo($user))->orWhereIn('id', $own)))
            ->orderBy('sort_order')->orderBy('id')->get(['id', 'company_id', 'name', 'color', 'is_default']);
    }

    /**
     * The workspace this request works in: the one picked in the header (sent as
     * X-Lead-Workspace), if the person has it, else their default one. Null when they have only one
     * workspace (nothing to narrow down).
     */
    public static function current(User $user): ?self
    {
        $request = app()->bound('request') ? request() : null;
        $key = "lead_workspace_{$user->id}";
        if ($request?->attributes->has($key)) {
            return $request->attributes->get($key);
        }

        // With one workspace in the company there is nothing to narrow down. Otherwise the one
        // picked in the header (if theirs), else their default; someone in no workspace at all
        // sees no workspace's records.
        $pick = null;
        if (self::query()->count() > 1) {
            $list = self::listFor($user);
            $wanted = (int) $request?->header('X-Lead-Workspace');
            $pick = $list->firstWhere('id', $wanted) ?? $list->firstWhere('is_default', true) ?? $list->first()
                ?? (new self)->forceFill(['id' => 0, 'is_default' => false]);
        }
        $request?->attributes->set($key, $pick);

        return $pick;
    }

    /**
     * The next team member in turn (round robin) for a lead moved into this pipeline, skipping
     * staff who are no longer active; null without a team.
     */
    public function nextAssignee(): ?int
    {
        $team = array_values(array_unique(array_map('intval', $this->member_ids ?? [])));
        $active = User::where('company_id', $this->company_id)->where('is_active', true)->whereIn('id', $team)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $team = array_values(array_filter($team, fn ($id) => in_array($id, $active, true)));
        if (! $team) {
            return null;
        }
        $last = self::withoutGlobalScopes()->whereKey($this->id)->lockForUpdate()->value('last_assigned_id');
        $at = array_search((int) $last, $team, true);
        $next = $team[$at === false ? 0 : ($at + 1) % count($team)];
        self::withoutGlobalScopes()->whereKey($this->id)->update(['last_assigned_id' => $next]);
        $this->last_assigned_id = $next;

        return $next;
    }
}
