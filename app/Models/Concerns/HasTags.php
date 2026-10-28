<?php

namespace App\Models\Concerns;

use App\Models\Tag;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

trait HasTags
{
    /**
     * @return MorphToMany<Tag, $this>
     */
    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable')->withPivot('tag_order')->orderByPivot('tag_order');
    }

    /**
     * Replace the tags with these names (created for the company when new), keeping their order.
     *
     * @param  array<int, string>  $names
     */
    public function syncTagNames(array $names): void
    {
        $sync = [];
        foreach (array_values(array_unique(array_filter(array_map('trim', $names)))) as $order => $name) {
            $tag = Tag::firstOrCreate(['company_id' => $this->company_id, 'name' => $name]);
            $sync[$tag->id] = ['tag_order' => $order];
        }

        $this->tags()->sync($sync);
    }
}
