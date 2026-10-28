<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A list's filters saved under a name (Perfex tblfilters).
 */
class SavedFilter extends Model
{
    use BelongsToCompany;

    /** The lists that offer saved filters. */
    public const IDENTIFIERS = ['tasks', 'projects', 'customers', 'invoices', 'estimates', 'proposals', 'contracts', 'expenses', 'tickets', 'leads'];

    protected $fillable = ['company_id', 'user_id', 'identifier', 'name', 'filters', 'is_shared'];

    protected function casts(): array
    {
        return ['filters' => 'array', 'is_shared' => 'boolean'];
    }

    /**
     * Mine and the team's shared ones.
     *
     * @param  Builder<SavedFilter>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        $query->where(fn (Builder $q) => $q->where('user_id', $user->id)->orWhere('is_shared', true));
    }

    public function canManage(User $user): bool
    {
        return (int) $this->user_id === (int) $user->id || $user->isAdmin();
    }
}
