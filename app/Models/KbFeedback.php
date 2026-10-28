<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * "Was this article helpful?" answer (Perfex tblknowedge_base_article_feedback).
 */
class KbFeedback extends Model
{
    protected $table = 'kb_feedback';

    protected $fillable = ['kb_article_id', 'user_id', 'helpful'];

    protected function casts(): array
    {
        return ['helpful' => 'boolean'];
    }
}
