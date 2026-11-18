<?php

namespace App\Models\Concerns;

use App\Support\Workspace;
use Illuminate\Database\Eloquent\Builder;

/**
 * A record of one workspace (Sales, Post-sales…): lists show the records of the workspace picked
 * in the header, and a new record goes into the workspace of the record it belongs to (see
 * workspaceParents()), else the open one. A record opened by its link from another workspace still
 * opens, for people who work in that workspace.
 */
trait BelongsToWorkspace
{
    public static function bootBelongsToWorkspace(): void
    {
        static::addGlobalScope('workspace', function (Builder $query) {
            if ($workspace = Workspace::filter()) {
                $column = $query->getModel()->qualifyColumn('workspace_id');
                // Records from before workspaces had none: they are the default workspace's.
                $workspace->is_default
                    ? $query->where(fn (Builder $q) => $q->where($column, $workspace->id)->orWhereNull($column))
                    : $query->where($column, $workspace->id);
            }
        });

        static::creating(function ($model) {
            $model->workspace_id ??= Workspace::forNew($model);
        });
    }

    public function initializeBelongsToWorkspace(): void
    {
        $this->mergeFillable(['workspace_id']);
    }

    /**
     * Opening a record by its link: found in any workspace the person works in, and the rest of
     * the request then shows that workspace's related records.
     */
    public function resolveRouteBinding($value, $field = null)
    {
        $record = $this->resolveRouteBindingQuery($this->newQueryWithoutScope('workspace'), $value, $field)->first();
        if ($record && $record->workspace_id) {
            if (! Workspace::canOpen((int) $record->workspace_id)) {
                return null;
            }
            Workspace::open((int) $record->workspace_id);
        }

        return $record;
    }

    /**
     * The columns whose record a new record takes its workspace from (column => model class).
     *
     * @return array<string, class-string>
     */
    public function workspaceParents(): array
    {
        return [];
    }
}
