<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\ChatGroup;
use App\Models\ChatGroupMember;
use App\Models\ChatMessage;
use App\Models\ChatPresence;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\User;
use App\Services\ChatMessages;
use App\Services\Options;
use App\Services\Realtime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Staff chat as in GICHRMS (Perfex "Powerful Chat"): one-to-one and group conversations with
 * files, unread counts, online status, "is typing" and search. The app polls these endpoints.
 */
class ChatController extends Controller
{
    /**
     * The chat sidebar: colleagues (status, last message, unread) and my groups. Also the
     * heartbeat that keeps me "online".
     */
    public function contacts(Request $request): JsonResponse
    {
        $me = $request->user();
        $presence = $this->touch($me);

        $staff = User::where('company_id', $me->company_id)->where('is_active', true)->whereKeyNot($me->id)->orderBy('full_name')->get();
        $presences = ChatPresence::whereIn('user_id', $staff->pluck('id'))->get()->keyBy('user_id');
        $unread = ChatMessage::direct()->where('receiver_id', $me->id)->whereNull('read_at')
            ->selectRaw('sender_id, count(*) as total')->groupBy('sender_id')->pluck('total', 'sender_id');
        $last = $this->lastDirectMessages($me);

        $groups = ChatGroup::whereHas('members', fn (Builder $q) => $q->where('user_id', $me->id))
            ->withCount('members')->with(['members' => fn ($q) => $q->where('user_id', $me->id)])->get();

        return response()->json([
            'me' => ['id' => $me->id, 'status' => $presence->status, 'theme' => $presence->theme ?? 'light', 'color' => $presence->color],
            'can_announce' => $me->isAdmin(),
            'customers' => ChatMessage::staffSeesCustomers($me) && Options::get('chat_clients_enabled') === '1' ? $this->customerConversations() : null,
            'staff' => $staff->map(fn (User $u) => [
                'id' => $u->id,
                'full_name' => $u->full_name,
                'photo_url' => $u->photoUrl(),
                'status' => $presences->get($u->id)?->visibleStatus() ?? 'offline',
                'unread' => (int) ($unread[$u->id] ?? 0),
                'last_message' => isset($last[$u->id]) ? $this->preview($last[$u->id], $me) : null,
            ])->values(),
            'groups' => $groups->map(function (ChatGroup $g) use ($me) {
                $lastRead = (int) ($g->members->first()?->last_read_message_id ?? 0);
                $lastMessage = $g->messages()->latest('id')->first();

                return [
                    'id' => $g->id,
                    'name' => $g->name,
                    'members_count' => $g->members_count,
                    'can_manage' => $g->canManage($me),
                    'unread' => $g->messages()->where('id', '>', $lastRead)->where('sender_id', '!=', $me->id)->count(),
                    'last_message' => $lastMessage ? $this->preview($lastMessage, $me) : null,
                ];
            })->sortByDesc(fn ($g) => $g['last_message']['at'] ?? '')->values(),
        ]);
    }

    /**
     * Total unread messages, for the badge in the header (also a heartbeat).
     */
    public function unread(Request $request): JsonResponse
    {
        $me = $request->user();
        $this->touch($me);
        $direct = ChatMessage::direct()->where('receiver_id', $me->id)->whereNull('read_at')->count();
        $group = ChatGroupMember::where('user_id', $me->id)->get()->sum(fn (ChatGroupMember $m) => ChatMessage::where('chat_group_id', $m->chat_group_id)
            ->where('id', '>', (int) $m->last_read_message_id)->where('sender_id', '!=', $me->id)->count());
        $customers = ChatMessage::staffSeesCustomers($me) ? ChatMessage::whereNotNull('contact_id')->where('from_contact', true)->whereNull('read_at')->count() : 0;
        $latest = ChatMessage::direct()->where('receiver_id', $me->id)->whereNull('read_at')->latest('id')->first();

        return response()->json(['data' => [
            'total' => $direct + $group + $customers,
            'latest' => $latest ? ['id' => $latest->id, 'sender' => User::find($latest->sender_id)?->full_name, 'text' => ChatMessages::previewText($latest)] : null,
        ]]);
    }

    public function status(Request $request): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(ChatPresence::STATUSES)]]);
        ChatPresence::updateOrCreate(['user_id' => $request->user()->id], ['status' => $data['status'], 'last_seen_at' => now()]);

        return response()->json(['data' => ['status' => $data['status']]]);
    }

    /**
     * One-to-one messages with a colleague: the latest page, older ones (before) or new ones
     * (after). Reading marks their messages to me as read.
     */
    public function directMessages(Request $request, int $userId): JsonResponse
    {
        $me = $request->user();
        $other = $this->colleague($me, $userId);
        $query = ChatMessage::direct()->where(fn (Builder $q) => $q
            ->where(fn (Builder $q) => $q->where('sender_id', $me->id)->where('receiver_id', $other->id))
            ->orWhere(fn (Builder $q) => $q->where('sender_id', $other->id)->where('receiver_id', $me->id)));

        $this->touch($me);
        $messages = ChatMessages::page($request, $query);
        if (ChatMessage::where('sender_id', $other->id)->where('receiver_id', $me->id)->whereNull('read_at')->update(['read_at' => now()])) {
            Realtime::toUsers([$other->id], 'chat', ['conversation' => "user:{$me->id}"]); // their "Seen"
        }

        return $this->messagesResponse($request, $messages, "user:{$other->id}", [
            'typing' => $this->typing($me, "user:{$me->id}", [$other->id]),
            // Lets the sender see "Seen" under their last message.
            'read_up_to' => (int) ChatMessage::where('sender_id', $me->id)->where('receiver_id', $other->id)->whereNotNull('read_at')->max('id'),
        ]);
    }

    public function sendDirect(Request $request, int $userId): JsonResponse
    {
        $me = $request->user();
        $other = $this->colleague($me, $userId);

        return $this->send($request, ['receiver_id' => $other->id], "user:{$other->id}");
    }

    public function groupMessages(Request $request, ChatGroup $chatGroup): JsonResponse
    {
        $me = $request->user();
        $this->memberOf($me, $chatGroup);

        $this->touch($me);
        $messages = ChatMessages::page($request, $chatGroup->messages()->getQuery());
        if ($maxId = $chatGroup->messages()->max('id')) {
            ChatGroupMember::where('chat_group_id', $chatGroup->id)->where('user_id', $me->id)->update(['last_read_message_id' => $maxId]);
        }

        return $this->messagesResponse($request, $messages, "group:{$chatGroup->id}", [
            'typing' => $this->typing($me, "group:{$chatGroup->id}", $chatGroup->members()->pluck('user_id')->all()),
            'members' => $chatGroup->members()->get()->map(fn (ChatGroupMember $m) => $m->user_id)->values(),
            'group' => ['id' => $chatGroup->id, 'name' => $chatGroup->name, 'created_by' => $chatGroup->created_by, 'can_manage' => $chatGroup->canManage($me)],
        ]);
    }

    public function sendGroup(Request $request, ChatGroup $chatGroup): JsonResponse
    {
        $this->memberOf($request->user(), $chatGroup);

        return $this->send($request, ['chat_group_id' => $chatGroup->id], "group:{$chatGroup->id}");
    }

    /**
     * The sender removes a message (and its files).
     */
    public function destroyMessage(Request $request, ChatMessage $chatMessage): JsonResponse
    {
        $this->authorize('update', $chatMessage);
        $chatMessage->delete();

        return response()->json(['message' => 'Message deleted.']);
    }

    /**
     * "is typing…": remembered for a few seconds for the other side's next poll.
     */
    public function typingStart(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate(['to' => ['required', 'string', 'regex:/^(user|group|contact):\d+$/']]);
        [$kind, $id] = explode(':', $data['to']);
        if ($kind === 'contact') {
            // The customer sees "<staff> is typing…".
            Cache::put(self::contactTypingKey($me->company_id, $this->customerContact($me, (int) $id)->id, 'staff'), $me->full_name, 6);
            Realtime::toContact((int) $id, 'typing', ['conversation' => 'staff', 'name' => $me->full_name]);

            return response()->json(['ok' => true]);
        }
        if ($kind === 'user') {
            $this->colleague($me, (int) $id);
            Realtime::toUsers([(int) $id], 'typing', ['conversation' => "user:{$me->id}", 'name' => $me->full_name]);
        } else {
            $group = ChatGroup::findOrFail((int) $id);
            $this->memberOf($me, $group);
            Realtime::toUsers($group->members()->where('user_id', '!=', $me->id)->pluck('user_id'), 'typing', ['conversation' => "group:{$group->id}", 'name' => $me->full_name]);
        }
        // For one-to-one chats the key is the receiver's inbox, so they see who types to them.
        Cache::put($this->typingKey($me->company_id, $data['to'], $me->id), true, 6);

        return response()->json(['ok' => true]);
    }

    /**
     * Files shared in a conversation (prchat "Shared files").
     */
    public function files(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate(['with' => ['required', 'string', 'regex:/^(user|group|contact):\d+$/']]);
        [$kind, $id] = explode(':', $data['with']);
        $messages = $kind === 'contact' ? ChatMessage::where('contact_id', $this->customerContact($me, (int) $id)->id) : ($kind === 'user'
            ? ChatMessage::direct()->where(fn (Builder $q) => $q
                ->where(fn (Builder $q) => $q->where('sender_id', $me->id)->where('receiver_id', $this->colleague($me, (int) $id)->id))
                ->orWhere(fn (Builder $q) => $q->where('sender_id', (int) $id)->where('receiver_id', $me->id)))
            : ChatMessage::where('chat_group_id', $this->memberOf($me, ChatGroup::findOrFail((int) $id))->id));

        $files = Attachment::where('attachable_type', ChatMessage::class)->whereIn('attachable_id', $messages->select('id'))->with('user')->latest('id')->limit(200)->get();

        return response()->json(['data' => AttachmentResource::collection($files)->resolve($request)]);
    }

    /**
     * Search my conversations.
     */
    public function search(Request $request): JsonResponse
    {
        $me = $request->user();
        $q = trim((string) $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']])['q']);
        $groupIds = ChatGroupMember::where('user_id', $me->id)->pluck('chat_group_id');

        $hits = ChatMessage::where('message', 'like', '%'.addcslashes($q, '%_').'%')
            ->where(fn (Builder $w) => $w->whereIn('chat_group_id', $groupIds)
                ->orWhere(fn (Builder $d) => $d->direct()->where(fn (Builder $p) => $p->where('sender_id', $me->id)->orWhere('receiver_id', $me->id)))
                ->when(ChatMessage::staffSeesCustomers($me), fn (Builder $c) => $c->orWhereNotNull('contact_id')))
            ->with(['group:id,name', 'contact.customer:id,name'])->latest('id')->limit(50)->get();
        $names = User::whereIn('id', $hits->pluck('sender_id')->merge($hits->pluck('receiver_id'))->filter()->unique())->pluck('full_name', 'id');

        return response()->json(['data' => $hits->map(fn (ChatMessage $m) => [
            'id' => $m->id,
            'message' => $m->message,
            'created_at' => $m->created_at,
            'sender' => $m->from_contact ? $m->contact?->fullName() : ($names[$m->sender_id] ?? null),
            'conversation' => $m->contact_id
                ? ['key' => "contact:{$m->contact_id}", 'name' => $m->contact?->fullName().' ('.$m->contact?->customer?->name.')']
                : ($m->chat_group_id
                ? ['key' => "group:{$m->chat_group_id}", 'name' => $m->group?->name]
                : ['key' => 'user:'.((int) $m->sender_id === (int) $me->id ? $m->receiver_id : $m->sender_id), 'name' => $names[(int) $m->sender_id === (int) $me->id ? $m->receiver_id : $m->sender_id] ?? null]),
        ])]);
    }

    /**
     * A customer conversation (customers-area chat). Opening it marks the customer's messages
     * read for the whole team.
     */
    public function customerMessages(Request $request, int $contactId): JsonResponse
    {
        $me = $request->user();
        $contact = $this->customerContact($me, $contactId);
        $this->touch($me);

        $messages = ChatMessages::page($request, ChatMessage::where('contact_id', $contact->id)->with('contact'));
        if (ChatMessage::where('contact_id', $contact->id)->where('from_contact', true)->whereNull('read_at')->update(['read_at' => now()])) {
            Realtime::toContact($contact->id, 'chat', ['conversation' => 'staff']); // the customer's "Seen"
        }

        return $this->messagesResponse($request, $messages, "contact:{$contact->id}", [
            'typing' => Cache::has(self::contactTypingKey($me->company_id, $contact->id, 'contact')) ? [$contact->fullName()] : [],
            'read_up_to' => (int) ChatMessage::where('contact_id', $contact->id)->where('from_contact', false)->whereNotNull('read_at')->max('id'),
            'contact' => [
                'id' => $contact->id,
                'name' => $contact->fullName(),
                'email' => $contact->email,
                'customer' => ['id' => $contact->customer->id, 'name' => $contact->customer->name],
                'can_log_in' => $contact->active && $contact->password !== null,
                'last_login_at' => $contact->last_login_at,
            ],
        ]);
    }

    public function sendCustomer(Request $request, int $contactId): JsonResponse
    {
        $contact = $this->customerContact($request->user(), $contactId);

        return $this->send($request, ['contact_id' => $contact->id], "contact:{$contact->id}");
    }

    /**
     * Customer contacts to start a chat with.
     */
    public function customerContactOptions(Request $request): JsonResponse
    {
        abort_unless(ChatMessage::staffSeesCustomers($request->user()), 403);
        $q = trim((string) $request->query('q'));

        $contacts = Contact::whereIn('customer_id', Customer::select('id'))->where('active', true)
            ->when($q !== '', fn ($w) => $w->where(fn ($w) => $w->where('first_name', 'like', "%{$q}%")->orWhere('last_name', 'like', "%{$q}%")->orWhere('email', 'like', "%{$q}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%"))))
            ->with('customer:id,name')->orderBy('first_name')->limit(30)->get();

        return response()->json(['data' => $contacts->map(fn (Contact $c) => [
            'id' => $c->id, 'name' => $c->fullName(), 'email' => $c->email, 'customer' => $c->customer?->name, 'can_log_in' => $c->password !== null,
        ])]);
    }

    /**
     * My chat look: light or dark, and the colour of my own messages.
     */
    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme' => ['sometimes', Rule::in(ChatPresence::THEMES)],
            'color' => ['sometimes', 'nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        $presence = $this->touch($request->user());
        $presence->update($data);

        return response()->json(['data' => ['theme' => $presence->theme, 'color' => $presence->color]]);
    }

    /**
     * Admins send one message to every colleague, or to every customer contact who can log in to
     * the customers area (prchat "announcement").
     */
    public function announce(Request $request): JsonResponse
    {
        $me = $request->user();
        abort_unless($me->isAdmin(), 403);
        $data = $request->validate([
            'audience' => ['required', Rule::in(['staff', 'customers'])],
            'message' => ['required', 'string', 'max:10000'],
        ]);

        $count = DB::transaction(function () use ($me, $data) {
            $rows = $data['audience'] === 'staff'
                ? User::where('company_id', $me->company_id)->where('is_active', true)->whereKeyNot($me->id)->pluck('id')->map(fn ($id) => ['receiver_id' => $id])
                : Contact::whereIn('customer_id', Customer::where('is_active', true)->select('id'))->where('active', true)->whereNotNull('password')->pluck('id')->map(fn ($id) => ['contact_id' => $id]);
            foreach ($rows as $target) {
                ChatMessage::create([...$target, 'sender_id' => $me->id, 'message' => $data['message'], 'is_announcement' => true]);
            }

            return $rows->count();
        });

        return response()->json(['message' => "Announcement sent to {$count} ".($data['audience'] === 'staff' ? 'colleagues' : 'customer contacts').'.', 'count' => $count]);
    }

    public function storeGroup(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'member_ids' => ['required', 'array', 'min:1'],
            'member_ids.*' => ['integer', Rule::exists('hrms.users', 'id')->where('company_id', $me->company_id)->where('is_active', true)],
        ]);

        $group = DB::transaction(function () use ($me, $data) {
            $group = ChatGroup::create(['name' => $data['name'], 'created_by' => $me->id]);
            foreach (collect($data['member_ids'])->push($me->id)->unique() as $userId) {
                $group->members()->create(['user_id' => $userId]);
            }

            return $group;
        });

        return response()->json(['data' => ['id' => $group->id, 'name' => $group->name]], 201);
    }

    public function updateGroup(Request $request, ChatGroup $chatGroup): JsonResponse
    {
        abort_unless($chatGroup->canManage($request->user()), 403);
        $chatGroup->update($request->validate(['name' => ['required', 'string', 'max:191']]));

        return response()->json(['data' => ['id' => $chatGroup->id, 'name' => $chatGroup->name]]);
    }

    public function addMembers(Request $request, ChatGroup $chatGroup): JsonResponse
    {
        $me = $request->user();
        abort_unless($chatGroup->canManage($me), 403);
        $ids = $request->validate([
            'user_ids' => ['required', 'array', 'min:1'],
            'user_ids.*' => ['integer', Rule::exists('hrms.users', 'id')->where('company_id', $me->company_id)->where('is_active', true)],
        ])['user_ids'];
        foreach (array_unique($ids) as $userId) {
            $chatGroup->members()->firstOrCreate(['user_id' => $userId], ['last_read_message_id' => $chatGroup->messages()->max('id')]);
        }

        return response()->json(['message' => 'Members added.']);
    }

    /**
     * The manager removes someone, or a member leaves. A group nobody is left in is removed.
     */
    public function removeMember(Request $request, ChatGroup $chatGroup, int $userId): JsonResponse
    {
        $me = $request->user();
        abort_unless((int) $me->id === $userId || $chatGroup->canManage($me), 403);
        $chatGroup->members()->where('user_id', $userId)->delete();

        if (! $chatGroup->members()->exists()) {
            $this->deleteGroupWithFiles($chatGroup);
        }

        return response()->json(['message' => (int) $me->id === $userId ? 'You left the group.' : 'Member removed.']);
    }

    public function destroyGroup(Request $request, ChatGroup $chatGroup): JsonResponse
    {
        abort_unless($chatGroup->canManage($request->user()), 403);
        $this->deleteGroupWithFiles($chatGroup);

        return response()->json(['message' => 'Group deleted.']);
    }

    private function deleteGroupWithFiles(ChatGroup $group): void
    {
        DB::transaction(function () use ($group) {
            $group->messages()->with('attachments')->get()->each->delete();
            $group->delete();
        });
    }

    /**
     * @param  array<string, int>  $target
     */
    private function send(Request $request, array $target, string $conversation): JsonResponse
    {
        $me = $request->user();
        $this->touch($me);
        $data = $request->validate(ChatMessages::rules());

        $message = DB::transaction(function () use ($me, $data, $target, $request) {
            $message = ChatMessage::create([...$target, 'sender_id' => $me->id, 'message' => trim((string) ($data['message'] ?? '')) ?: null]);
            foreach ($request->file('files', []) as $file) {
                ChatMessages::storeFile($message, $file, $me->id, (int) $me->company_id);
            }

            return $message;
        });

        if (isset($target['chat_group_id'])) {
            ChatGroupMember::where('chat_group_id', $target['chat_group_id'])->where('user_id', $me->id)->update(['last_read_message_id' => $message->id]);
        }
        Cache::forget($this->typingKey($me->company_id, $conversation, $me->id));
        if (isset($target['contact_id'])) {
            Cache::forget(self::contactTypingKey($me->company_id, $target['contact_id'], 'staff'));
        }

        return response()->json(['data' => $this->present($message->load('attachments.user'), $me)], 201);
    }

    /**
     * @param  Collection<int, ChatMessage>  $messages
     * @param  array<string, mixed>  $extra
     */
    private function messagesResponse(Request $request, Collection $messages, string $conversation, array $extra): JsonResponse
    {
        $me = $request->user();

        return response()->json([
            'data' => $messages->map(fn (ChatMessage $m) => $this->present($m, $me))->values(),
            'meta' => ['conversation' => $conversation, 'has_more' => ! $request->filled('after') && $messages->count() === ChatMessages::PAGE, ...$extra],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ChatMessage $m, User $me): array
    {
        return ChatMessages::present(
            $m,
            ! $m->from_contact && (int) $m->sender_id === (int) $me->id,
            $m->from_contact ? $m->contact?->fullName() : null,
            fn (Attachment $a) => "/api/files/{$a->id}/download",
        );
    }

    /**
     * @return array{text: string, at: mixed, own: bool}
     */
    private function preview(ChatMessage $m, User $me): array
    {
        return ['text' => ChatMessages::previewText($m), 'at' => $m->created_at, 'own' => ! $m->from_contact && (int) $m->sender_id === (int) $me->id];
    }

    /**
     * The latest one-to-one message with each colleague.
     *
     * @return \Illuminate\Support\Collection<int, ChatMessage>
     */
    private function lastDirectMessages(User $me): \Illuminate\Support\Collection
    {
        $ids = ChatMessage::direct()->where(fn (Builder $q) => $q->where('sender_id', $me->id)->orWhere('receiver_id', $me->id))
            ->selectRaw('max(id) as id, case when sender_id = ? then receiver_id else sender_id end as other', [$me->id])
            ->groupBy('other')->pluck('id', 'other');

        $messages = ChatMessage::whereIn('id', $ids->values())->get()->keyBy('id');

        return $ids->map(fn ($id) => $messages[$id] ?? null)->filter();
    }

    /**
     * @param  array<int, int>  $userIds
     * @return array<int, string>
     */
    private function typing(User $me, string $conversation, array $userIds): array
    {
        $names = [];
        foreach ($userIds as $userId) {
            if ((int) $userId !== (int) $me->id && Cache::has($this->typingKey($me->company_id, $conversation, (int) $userId))) {
                $names[] = User::find($userId)?->full_name;
            }
        }

        return array_values(array_filter($names));
    }

    private function typingKey(int $companyId, string $conversation, int $userId): string
    {
        return "chat-typing:{$companyId}:{$conversation}:{$userId}";
    }

    private function touch(User $me): ChatPresence
    {
        $presence = ChatPresence::firstOrNew(['user_id' => $me->id], ['status' => 'online']);
        $presence->last_seen_at = now();
        $presence->save();

        return $presence;
    }

    private function colleague(User $me, int $userId): User
    {
        $user = User::where('company_id', $me->company_id)->whereKey($userId)->first();
        abort_unless($user && $user->id !== $me->id, 404);

        return $user;
    }

    private function memberOf(User $me, ChatGroup $group): ChatGroup
    {
        abort_unless($group->hasMember($me), 403);

        return $group;
    }

    /**
     * Customer conversations, newest first, with the customers' unread messages.
     *
     * @return array<int, array<string, mixed>>
     */
    private function customerConversations(): array
    {
        $latestIds = ChatMessage::whereNotNull('contact_id')->selectRaw('max(id) as id')->groupBy('contact_id')->pluck('id');
        $latest = ChatMessage::whereIn('id', $latestIds)->with('contact.customer:id,name')->orderByDesc('id')->limit(200)->get();
        $unread = ChatMessage::whereNotNull('contact_id')->where('from_contact', true)->whereNull('read_at')
            ->selectRaw('contact_id, count(*) as total')->groupBy('contact_id')->pluck('total', 'contact_id');

        return $latest->filter(fn (ChatMessage $m) => $m->contact !== null)->map(fn (ChatMessage $m) => [
            'id' => $m->contact_id,
            'name' => $m->contact->fullName(),
            'customer' => $m->contact->customer?->name,
            'unread' => (int) ($unread[$m->contact_id] ?? 0),
            'last_message' => ['text' => ChatMessages::previewText($m), 'at' => $m->created_at, 'own' => ! $m->from_contact],
        ])->values()->all();
    }

    private function customerContact(User $me, int $contactId): Contact
    {
        abort_unless(ChatMessage::staffSeesCustomers($me), 403);
        // Customer has the company scope: a contact of another company is not found.
        $contact = Contact::whereKey($contactId)->whereIn('customer_id', Customer::select('id'))->with('customer')->first();
        abort_unless($contact, 404);

        return $contact;
    }

    public static function contactTypingKey(int $companyId, int $contactId, string $side): string
    {
        return "chat-typing:{$companyId}:contact:{$contactId}:{$side}";
    }
}
