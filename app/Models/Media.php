<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Utilities → Media: the company's shared file library.
 */
class Media extends Model
{
    use BelongsToCompany;

    protected $table = 'media';

    protected $fillable = ['company_id', 'folder', 'disk_path', 'original_name', 'mime_type', 'size', 'user_id'];

    protected static function booted(): void
    {
        static::deleted(fn (Media $media) => Storage::disk('local')->delete($media->disk_path));
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
