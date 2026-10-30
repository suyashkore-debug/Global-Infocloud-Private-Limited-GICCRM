<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a project's activity log. description_key is a Perfex activity key
 * (e.g. "project_activity_created"); the app shows its label.
 */
class ProjectActivity extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['project_id', 'user_id', 'description_key', 'additional_data'];

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
