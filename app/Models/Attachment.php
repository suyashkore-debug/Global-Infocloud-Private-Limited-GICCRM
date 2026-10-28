<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\Storage;

/**
 * An uploaded file (or an external link) on a project, a task or a discussion comment.
 * project_id is set for all of them so a project's files can be cleaned up together.
 */
class Attachment extends Model
{
    use BelongsToCompany;

    protected $table = 'files';

    protected $fillable = [
        'company_id', 'attachable_type', 'attachable_id', 'project_id', 'user_id', 'disk_path',
        'original_name', 'mime_type', 'size', 'subject', 'description', 'external_link',
    ];

    protected static function booted(): void
    {
        static::deleted(function (Attachment $attachment) {
            if ($attachment->disk_path) {
                Storage::disk('local')->delete($attachment->disk_path);
            }
        });
    }

    public function isImage(): bool
    {
        return str_starts_with((string) $this->mime_type, 'image/');
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function attachable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
