<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\Contact;
use App\Support\CurrentCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Signs private-channel subscriptions for the Reverb socket (Pusher protocol). A staff member may
 * listen on their own channel and, when they chat with customers, their company's customer-chat
 * channel; a customers-area contact only on their own channel.
 */
class RealtimeAuthController extends Controller
{
    public function staff(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $me = $request->user();
        $allowed = $data['channel_name'] === "private-projects.user.{$me->id}"
            || ($data['channel_name'] === 'private-projects.company.'.CurrentCompany::id().'.customers' && ChatMessage::staffSeesCustomers($me));
        abort_unless($allowed, 403);

        return $this->sign($data['socket_id'], $data['channel_name']);
    }

    public function contact(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        /** @var Contact $contact */
        $contact = $request->attributes->get('contact');
        abort_unless($data['channel_name'] === "private-projects.contact.{$contact->id}", 403);

        return $this->sign($data['socket_id'], $data['channel_name']);
    }

    /** @return array{socket_id: string, channel_name: string} */
    private function validated(Request $request): array
    {
        return $request->validate([
            'socket_id' => ['required', 'string', 'regex:/^\d+\.\d+$/'],
            'channel_name' => ['required', 'string', 'max:200'],
        ]);
    }

    private function sign(string $socketId, string $channel): JsonResponse
    {
        $key = (string) config('broadcasting.connections.reverb.key');
        $secret = (string) config('broadcasting.connections.reverb.secret');
        abort_if($key === '' || $secret === '', 503, 'Live updates are not configured.');

        return response()->json(['auth' => $key.':'.hash_hmac('sha256', "{$socketId}:{$channel}", $secret)]);
    }
}
