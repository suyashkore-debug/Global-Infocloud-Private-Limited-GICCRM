<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Services\ChatMessages;
use App\Services\Realtime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A chat message: to one staff member (receiver_id), to a group (chat_group_id) or in a
 * customer conversation (contact_id; from_contact when the customer wrote it), with optional
 * files. Announcements are sent to everyone at once.
 */
class ChatMessage extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'sender_id', 'receiver_id', 'chat_group_id', 'contact_id', 'from_contact', 'is_announcement', 'message', 'read_at'];

    protected static function booted(): void
    {
        // Removes the files from disk too (Attachment::deleted).
        static::deleting(fn (ChatMessage $message) => $message->attachments->each->delete());
        // Everyone in the conversation reloads it at once (live chat).
        static::created(function (ChatMessage $message) {
            Realtime::chatChanged($message);
            ChatMessages::push($message);
        });
        static::deleted(fn (ChatMessage $message) => Realtime::chatChanged($message));
    }

    protected function casts(): array
    {
        return ['read_at' => 'datetime', 'from_contact' => 'boolean', 'is_announcement' => 'boolean'];
    }

    /**
     * One-to-one staff messages (not group, not customer conversations).
     *
     * @param  Builder<ChatMessage>  $query
     */
    public function scopeDirect(Builder $query): void
    {
        $query->whereNull('chat_group_id')->whereNull('contact_id');
    }

    /**
     * @return BelongsTo<ChatGroup, $this>
     */
    public function group(): BelongsTo
    {
        return $this->belongsTo(ChatGroup::class, 'chat_group_id');
    }

    /**
     * @return BelongsTo<Contact, $this>
     */
    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }

    /**
     * Whether the user is in this conversation (sender, receiver or group member).
     */
    public function involves(User $user): bool
    {
        if ($this->contact_id) {
            return self::staffSeesCustomers($user);
        }
        if ($this->chat_group_id) {
            return (bool) $this->group?->hasMember($user);
        }

        return in_array((int) $user->id, [(int) $this->sender_id, (int) $this->receiver_id], true);
    }

    /**
     * Customer chats are for staff who may see customers.
     */
    public static function staffSeesCustomers(User $user): bool
    {
        return $user->isAdmin() || $user->hasPermission('customers', 'view');
    }
}
