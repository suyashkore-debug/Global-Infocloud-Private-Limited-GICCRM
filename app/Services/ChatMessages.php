<?php

namespace App\Services;

use App\Jobs\SendPushNotification;
use App\Models\Attachment;
use App\Models\ChatGroup;
use App\Models\ChatGroupMember;
use App\Models\ChatMessage;
use App\Models\Contact;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

/**
 * What staff chat and the customers-area chat share: paging, files and how a message is shown.
 */
class ChatMessages
{
    public const PAGE = 40;

    public const MAX_FILE_KB = 25600;

    /**
     * @return array<string, array<int, string>>
     */
    public static function rules(): array
    {
        return [
            'message' => ['nullable', 'string', 'max:10000', 'required_without:files'],
            'files' => ['nullable', 'array', 'max:10'],
            'files.*' => ['file', 'max:'.self::MAX_FILE_KB],
        ];
    }

    /**
     * The latest page, older messages (before) or new ones (after).
     *
     * @param  Builder<ChatMessage>  $query
     * @return Collection<int, ChatMessage>
     */
    public static function page(Request $request, Builder $query): Collection
    {
        $data = $request->validate(['before' => ['nullable', 'integer'], 'after' => ['nullable', 'integer']]);
        $query->with('attachments.user');

        if (! empty($data['after'])) {
            return $query->where('id', '>', $data['after'])->orderBy('id')->limit(200)->get();
        }

        return $query->when($data['before'] ?? null, fn (Builder $q, int $before) => $q->where('id', '<', $before))
            ->orderByDesc('id')->limit(self::PAGE)->get()->reverse()->values();
    }

    public static function storeFile(ChatMessage $message, UploadedFile $file, ?int $userId, int $companyId): Attachment
    {
        $name = $file->getClientOriginalName();
        $mime = $file->getMimeType();
        // Browsers record voice messages as WebM/Ogg; the server may see them as video.
        if (str_starts_with($name, 'voice-message') && str_starts_with((string) $file->getClientMimeType(), 'audio/')) {
            $mime = $file->getClientMimeType();
        }

        return $message->attachments()->create([
            'company_id' => $companyId,
            'user_id' => $userId,
            'disk_path' => $file->store('attachments/'.$companyId.'/chat', 'local'),
            'original_name' => $name,
            'mime_type' => $mime,
            'size' => $file->getSize(),
        ]);
    }

    /**
     * @param  callable(Attachment): string  $downloadUrl
     * @return array<string, mixed>
     */
    public static function present(ChatMessage $m, bool $own, ?string $senderName, callable $downloadUrl): array
    {
        return [
            'id' => $m->id,
            'sender_id' => $m->sender_id,
            'sender_name' => $senderName,
            'message' => $m->message,
            'is_own' => $own,
            'from_contact' => $m->from_contact,
            'is_announcement' => $m->is_announcement,
            'created_at' => $m->created_at,
            'files' => $m->attachments->map(fn (Attachment $a) => [
                'id' => $a->id,
                'original_name' => $a->original_name,
                'size' => $a->size,
                'is_image' => $a->isImage(),
                'is_audio' => str_starts_with((string) $a->mime_type, 'audio/'),
                'download_url' => $downloadUrl($a),
            ])->values(),
        ];
    }

    /**
     * Phone / browser notification for a new chat message, to everyone on the receiving side
     * (never the sender). Customers' messages go to the staff who chat with customers.
     */
    public static function push(ChatMessage $m): void
    {
        $text = $m->message ? self::previewText($m) : '📎 Sent a file';

        if ($m->from_contact && $m->contact_id) {
            $contact = Contact::find($m->contact_id);
            $staff = User::where('company_id', $m->company_id)->where('is_active', true)
                ->where(fn ($q) => $q->where('is_company_admin', true)->orWhereHas('staffPermissions', fn ($p) => $p->where('feature', 'customers')->where('capability', 'view')))
                ->pluck('id');
            SendPushNotification::toUsers($staff, ['title' => ($contact?->fullName() ?? 'Customer').' (customer)', 'body' => $text, 'url' => "/chat?with=contact:{$m->contact_id}", 'tag' => "chat-contact-{$m->contact_id}"]);

            return;
        }
        $sender = User::find($m->sender_id)?->full_name ?? 'Someone';
        if ($m->chat_group_id) {
            $group = ChatGroup::find($m->chat_group_id);
            $members = ChatGroupMember::where('chat_group_id', $m->chat_group_id)->where('user_id', '!=', $m->sender_id)->pluck('user_id');
            SendPushNotification::toUsers($members, ['title' => $group?->name ?? 'Group chat', 'body' => "{$sender}: {$text}", 'url' => "/chat?with=group:{$m->chat_group_id}", 'tag' => "chat-group-{$m->chat_group_id}"]);
        } elseif ($m->receiver_id) {
            SendPushNotification::toUsers([$m->receiver_id], ['title' => $sender, 'body' => $text, 'url' => "/chat?with=user:{$m->sender_id}", 'tag' => "chat-user-{$m->sender_id}"]);
        }
    }

    public static function previewText(ChatMessage $m): string
    {
        if ($m->message) {
            return ($m->is_announcement ? '📢 ' : '').mb_strimwidth($m->message, 0, 80, '…');
        }
        $file = $m->attachments()->first();

        return $file && str_starts_with((string) $file->mime_type, 'audio/') ? '🎤 Voice message' : '📎 '.($file->original_name ?? 'File');
    }
}
