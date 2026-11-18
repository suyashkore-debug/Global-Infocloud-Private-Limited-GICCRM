<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Services\Options;
use App\Support\CurrentCompany;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class EmailTemplate extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'workspace_id', 'type', 'slug', 'name', 'subject', 'message', 'from_name', 'plaintext', 'active'];

    protected static function booted(): void
    {
        // Each workspace has its own templates (the default workspace's have no workspace_id).
        static::addGlobalScope('workspace', function (Builder $query) {
            if ($company = CurrentCompany::id()) {
                $query->where($query->getModel()->qualifyColumn('workspace_id'), Options::workspaceId($company));
            }
        });
    }

    protected function casts(): array
    {
        return ['plaintext' => 'boolean', 'active' => 'boolean'];
    }
}
