<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A group chat; its creator (or an admin) manages the name and members.
 */
class ChatGroup extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'created_by'];

    /**
     * @return HasMany<ChatGroupMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ChatGroupMember::class);
    }

    /**
     * @return HasMany<ChatMessage, $this>
     */
    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }

    public function hasMember(User $user): bool
    {
        return $this->members()->where('user_id', $user->id)->exists();
    }

    public function canManage(User $user): bool
    {
        return (int) $this->created_by === (int) $user->id || $user->isAdmin();
    }
}
