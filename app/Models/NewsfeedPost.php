<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\DB;

class NewsfeedPost extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'user_id', 'content', 'visibility', 'pinned', 'pinned_at'];

    protected function casts(): array
    {
        return ['visibility' => 'array', 'pinned' => 'boolean', 'pinned_at' => 'datetime'];
    }

    /**
     * Perfex: a post for some departments is seen by their members, its author and admins.
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->isAdmin()) {
            return;
        }
        $departments = self::departmentIdsOf($user->id);

        $query->where(function (Builder $q) use ($user, $departments) {
            $q->whereNull('visibility')->orWhere('user_id', $user->id);
            foreach ($departments as $id) {
                $q->orWhereJsonContains('visibility', $id);
            }
        });
    }

    public function isVisibleTo(User $user): bool
    {
        return $user->isAdmin() || $this->visibility === null || (int) $this->user_id === (int) $user->id
            || array_intersect(array_map('intval', $this->visibility), self::departmentIdsOf($user->id)) !== [];
    }

    /**
     * @return array<int, int>
     */
    public static function departmentIdsOf(int $userId): array
    {
        return DB::table('support_department_user')->where('user_id', $userId)->pluck('support_department_id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * @return HasMany<NewsfeedComment, $this>
     */
    public function comments(): HasMany
    {
        return $this->hasMany(NewsfeedComment::class);
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }
}
