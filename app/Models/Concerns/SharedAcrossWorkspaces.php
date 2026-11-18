<?php

namespace App\Models\Concerns;

use App\Support\Workspace;
use Illuminate\Database\Eloquent\Builder;

/**
 * A Setup list item (tax, payment mode, group, status…) for one workspace, or for all of them
 * when workspace_id is empty. Lists and pickers show the open workspace's items and the common
 * ones (forWorkspace); records keep whatever item they were given.
 */
trait SharedAcrossWorkspaces
{
    public function initializeSharedAcrossWorkspaces(): void
    {
        $this->mergeFillable(['workspace_id']);
    }

    /**
     * The items of the open workspace (or the given one) and the common ones.
     *
     * @param  Builder<static>  $query
     */
    public function scopeForWorkspace(Builder $query, ?int $workspaceId = null): void
    {
        $workspaceId ??= Workspace::activeId();
        if ($workspaceId) {
            $column = $query->getModel()->qualifyColumn('workspace_id');
            $query->where(fn (Builder $q) => $q->whereNull($column)->orWhere($column, $workspaceId));
        }
    }
}
