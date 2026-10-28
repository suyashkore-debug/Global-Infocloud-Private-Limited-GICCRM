<?php

namespace App\Services;

use App\Models\PushSubscription;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Delivers Web Push messages (the phone / browser notification) with the app's VAPID keys.
 * Subscriptions the push service reports as gone (404 / 410) are removed.
 */
class PushSender
{
    public static function configured(): bool
    {
        return (bool) config('services.webpush.public_key') && (bool) config('services.webpush.private_key');
    }

    /**
     * @param  iterable<PushSubscription>  $subscriptions
     * @param  array{title: string, body: string, url?: string|null, tag?: string|null}  $message
     */
    public function send(iterable $subscriptions, array $message): void
    {
        if (! self::configured()) {
            return;
        }
        $push = new WebPush(['VAPID' => [
            'subject' => (string) config('services.webpush.subject'),
            'publicKey' => (string) config('services.webpush.public_key'),
            'privateKey' => (string) config('services.webpush.private_key'),
        ]], ['TTL' => 3600, 'urgency' => 'high'], 10);
        $payload = json_encode($message, JSON_UNESCAPED_UNICODE);

        foreach ($subscriptions as $s) {
            $push->queueNotification(Subscription::create([
                'endpoint' => $s->endpoint,
                'publicKey' => $s->public_key,
                'authToken' => $s->auth_token,
                'contentEncoding' => 'aes128gcm',
            ]), $payload);
        }
        foreach ($push->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                PushSubscription::where('endpoint', $report->getEndpoint())->delete();
            } elseif (! $report->isSuccess()) {
                logger()->warning('Web push failed', ['reason' => $report->getReason()]);
            }
        }
    }
}
