<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use App\Services\PushSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Phone / browser notifications (PWA Web Push): the public key to subscribe with, and saving or
 * removing this device's subscription for the signed-in staff member.
 */
class PushController extends Controller
{
    public function key(): JsonResponse
    {
        return response()->json(['data' => ['public_key' => PushSender::configured() ? config('services.webpush.public_key') : null]]);
    }

    public function subscribe(Request $request): JsonResponse
    {
        abort_unless(PushSender::configured(), 503, 'Phone notifications are not set up on this server.');
        $data = $request->validate([
            'endpoint' => ['required', 'url:https', 'max:500'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
        ]);
        // The same device signing in as someone else moves to that person.
        PushSubscription::updateOrCreate(['endpoint' => $data['endpoint']], [
            'user_id' => $request->user()->id,
            'public_key' => $data['keys']['p256dh'],
            'auth_token' => $data['keys']['auth'],
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);

        return response()->json(['message' => 'Notifications are on for this device.']);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'string', 'max:500']]);
        PushSubscription::where('endpoint', $data['endpoint'])->where('user_id', $request->user()->id)->delete();

        return response()->json(['message' => 'Notifications are off for this device.']);
    }
}
