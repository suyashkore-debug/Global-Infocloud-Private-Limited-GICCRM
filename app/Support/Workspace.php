<?php

namespace App\Support;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\LeadStatus;
use App\Models\User;
use App\Services\Options;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * The workspace (Sales, Post-sales…) the CRM is used in: picked in the header, it narrows
 * customers, sales, projects, tasks, tickets and the rest to its records (BelongsToWorkspace).
 * Staff, permissions and the company's details are common; the rest of Setup can differ per
 * workspace (Options, SharedAcrossWorkspaces).
 */
class Workspace
{
    /**
     * The workspace to show records of in this request, or null for no narrowing (one workspace
     * in the company; queue, console, customers area and public pages).
     */
    public static function filterId(): ?int
    {
        return self::filter()?->id;
    }

    /**
     * The workspace this request or job works in: the one pinned for a job / public page /
     * webhook (Options::useWorkspace), else the one open in the header. Null when not narrowed.
     */
    public static function activeId(): ?int
    {
        [$pinned, $isPinned] = Options::state();
        if ($isPinned) {
            $company = CurrentCompany::id();

            return $pinned ?: ($company ? self::defaultId($company) : null);
        }

        return self::filterId() ?: null;
    }

    /**
     * The workspace whose settings apply to a record (its own, a lead's by its status), or
     * false for a record that belongs to no workspace.
     */
    public static function settingsOf(?Model $record): int|false|null
    {
        if ($record instanceof Lead) {
            $id = LeadStatus::withoutGlobalScopes()->whereKey($record->lead_status_id)->value('pipeline_id');

            return $id ? (int) $id : null;
        }
        if ($record && in_array(BelongsToWorkspace::class, class_uses_recursive($record), true)) {
            return $record->workspace_id ? (int) $record->workspace_id : null;
        }

        return false;
    }

    /**
     * Run with the settings of a record's workspace (e-mail account, templates, numbering…);
     * as is for a record of no workspace.
     *
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function withSettingsOf(?Model $record, callable $callback): mixed
    {
        $id = self::settingsOf($record);

        return $id === false ? $callback() : Options::within($id, $callback);
    }

    /**
     * What a webhook URL carries for the workspace whose settings apply now (its own WhatsApp
     * number or Exotel account), "" for the default workspace.
     */
    public static function webhookQuery(int $companyId): string
    {
        $id = Options::workspaceId($companyId);

        return $id ? "?workspace={$id}" : "";
    }

    /** The workspace itself (with is_default), as filterId(). */
    public static function filter(): ?LeadPipeline
    {
        $user = Auth::user();

        return $user instanceof User ? LeadPipeline::current($user) : null;
    }

    /**
     * The workspace of a new record: the one of the record it belongs to (its customer, project,
     * invoice…), else the one open in the header, else the company's default workspace.
     */
    public static function forNew(Model $model): ?int
    {
        foreach (method_exists($model, 'workspaceParents') ? $model->workspaceParents() : [] as $column => $class) {
            $id = $model->getAttribute($column);
            if (! $id) {
                continue;
            }
            $found = $class === Lead::class
                ? LeadStatus::withoutGlobalScopes()->whereKey(Lead::withoutGlobalScopes()->whereKey($id)->value('lead_status_id'))->value('pipeline_id')
                : $class::withoutGlobalScopes()->whereKey($id)->value('workspace_id');
            if ($found) {
                return (int) $found;
            }
        }

        return self::filterId() ?? self::defaultId((int) $model->getAttribute('company_id'));
    }

    public static function defaultId(int $companyId): ?int
    {
        $id = LeadPipeline::withoutGlobalScopes()->where('company_id', $companyId)->orderByDesc('is_default')->orderBy('sort_order')->value('id');

        return $id ? (int) $id : null;
    }

    /**
     * A record opened by its link (a notification, a bookmark) from another workspace: shown,
     * if the person works in that workspace, with its own workspace's related records.
     */
    public static function canOpen(?int $workspaceId): bool
    {
        $user = Auth::user();
        if (! $workspaceId || ! $user instanceof User || $user->isAdmin()) {
            return true;
        }

        return LeadPipeline::listFor($user)->contains('id', $workspaceId) || ! LeadPipeline::withoutGlobalScopes()->whereKey($workspaceId)->exists();
    }

    public static function open(int $workspaceId): void
    {
        $user = Auth::user();
        if ($user instanceof User && app()->bound('request')) {
            $pipeline = LeadPipeline::withoutGlobalScopes()->find($workspaceId);
            $current = LeadPipeline::current($user);
            if ($pipeline && $current && (int) $pipeline->company_id === (int) $user->company_id && (int) $current->id !== $workspaceId) {
                request()->attributes->set("lead_workspace_{$user->id}", $pipeline);
                // Told to the app, which then switches to it.
                request()->attributes->set('record_workspace', $workspaceId);
            }
        }
    }
}
