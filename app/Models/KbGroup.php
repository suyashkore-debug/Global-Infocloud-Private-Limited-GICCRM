<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KbGroup extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'description', 'color', 'active', 'group_order'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    /**
     * @return HasMany<KbArticle, $this>
     */
    public function articles(): HasMany
    {
        return $this->hasMany(KbArticle::class)->orderBy('article_order')->orderBy('subject');
    }
}
