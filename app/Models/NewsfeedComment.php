<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NewsfeedComment extends Model
{
    protected $fillable = ['newsfeed_post_id', 'user_id', 'content'];

    /**
     * @return BelongsTo<NewsfeedPost, $this>
     */
    public function post(): BelongsTo
    {
        return $this->belongsTo(NewsfeedPost::class, 'newsfeed_post_id');
    }
}
