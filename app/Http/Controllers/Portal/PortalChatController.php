<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\ChatMessage;
use App\Models\Contact;
use App\Models\User;
use App\Services\ChatMessages;
use App\Services\Options;
use App\Services\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Customers-area chat (prchat client chat): the logged-in contact talks with the company's team.
 * Any staff member who may see customers answers; the contact sees who replied.
 */
class PortalChatController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        $messages = ChatMessages::page($request, ChatMessage::where('contact_id', $contact->id));
        if (ChatMessage::where('contact_id', $contact->id)->where('from_contact', false)->whereNull('read_at')->update(['read_at' => now()])) {
            Realtime::toCustomerChatStaff($this->companyId($contact), 'chat', ['conversation' => "contact:{$contact->id}"]); // staff's "Seen"
        }
        $names = User::whereIn('id', $messages->pluck('sender_id')->filter()->unique())->get()->keyBy('id');

        return response()->json([
            'data' => $messages->map(fn (ChatMessage $m) => ChatMessages::present(
                $m,
                $m->from_contact,
                $m->from_contact ? $contact->fullName() : $names->get($m->sender_id)?->full_name,
                fn (Attachment $a) => "/api/portal/chat/files/{$a->id}",
            ))->values(),
            'meta' => [
                'has_more' => ! $request->filled('after') && $messages->count() === ChatMessages::PAGE,
                'typing' => array_values(array_filter([Cache::get(ChatController::contactTypingKey($this->companyId($contact), $contact->id, 'staff'))])),
                'read_up_to' => (int) ChatMessage::where('contact_id', $contact->id)->where('from_contact', true)->whereNotNull('read_at')->max('id'),
            ],
        ]);
    }

    public function send(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        $data = $request->validate(ChatMessages::rules());

        $message = DB::transaction(function () use ($contact, $data, $request) {
            $message = ChatMessage::create(['contact_id' => $contact->id, 'from_contact' => true, 'message' => trim((string) ($data['message'] ?? '')) ?: null]);
            foreach ($request->file('files', []) as $file) {
                ChatMessages::storeFile($message, $file, null, $this->companyId($contact));
            }

            return $message;
        });
        Cache::forget(ChatController::contactTypingKey($this->companyId($contact), $contact->id, 'contact'));

        return response()->json(['data' => ChatMessages::present($message->load('attachments'), true, $contact->fullName(), fn (Attachment $a) => "/api/portal/chat/files/{$a->id}")], 201);
    }

    public function typing(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        Cache::put(ChatController::contactTypingKey($this->companyId($contact), $contact->id, 'contact'), true, 6);
        Realtime::toCustomerChatStaff($this->companyId($contact), 'typing', ['conversation' => "contact:{$contact->id}", 'name' => $contact->fullName()]);

        return response()->json(['ok' => true]);
    }

    public function unread(Request $request): JsonResponse
    {
        $contact = $this->contact($request);

        return response()->json(['data' => ['total' => ChatMessage::where('contact_id', $contact->id)->where('from_contact', false)->whereNull('read_at')->count()]]);
    }

    /**
     * A file from the contact's own conversation.
     */
    public function file(Request $request, int $attachmentId): StreamedResponse
    {
        $contact = $this->contact($request);
        $file = Attachment::where('attachable_type', ChatMessage::class)->whereKey($attachmentId)
            ->whereIn('attachable_id', ChatMessage::where('contact_id', $contact->id)->select('id'))->first();
        abort_unless($file && $file->disk_path, 404);

        return response()->streamDownload(
            fn () => print Storage::disk('local')->get($file->disk_path),
            $file->original_name,
            ['Content-Type' => $file->mime_type ?: 'application/octet-stream'],
        );
    }

    private function contact(Request $request): Contact
    {
        /** @var Contact $contact */
        $contact = $request->attributes->get('contact');
        abort_unless(Options::get('chat_clients_enabled', $this->companyId($contact)) === '1', 403, 'Chat is not available.');

        return $contact;
    }

    private function companyId(Contact $contact): int
    {
        return (int) $contact->customer->company_id;
    }
}
