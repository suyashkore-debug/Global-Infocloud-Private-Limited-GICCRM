<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KbArticle extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'kb_group_id', 'subject', 'slug', 'description', 'active', 'staff_article', 'article_order', 'views', 'created_by'];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'staff_article' => 'boolean'];
    }

    /**
     * @return BelongsTo<KbGroup, $this>
     */
    public function group(): BelongsTo
    {
        return $this->belongsTo(KbGroup::class, 'kb_group_id');
    }

    /**
     * @return HasMany<KbFeedback, $this>
     */
    public function feedback(): HasMany
    {
        return $this->hasMany(KbFeedback::class);
    }
}
