<?php

namespace App\Jobs;

use App\Models\PushSubscription;
use App\Services\PushSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Sends one notification to every phone / browser of the given staff members (queued, so the
 * request that caused it does not wait for the push services).
 *
 * @phpstan-type Message array{title: string, body: string, url?: string|null, tag?: string|null}
 */
class SendPushNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    /**
     * @param  array<int, int>  $userIds
     * @param  array{title: string, body: string, url?: string|null, tag?: string|null}  $message
     */
    public function __construct(public array $userIds, public array $message) {}

    /**
     * Queue it only when someone has a subscribed device.
     *
     * @param  iterable<int>  $userIds
     * @param  array{title: string, body: string, url?: string|null, tag?: string|null}  $message
     */
    public static function toUsers(iterable $userIds, array $message): void
    {
        $ids = collect($userIds)->map(fn ($id) => (int) $id)->filter()->unique()->values()->all();
        if ($ids !== [] && PushSender::configured() && PushSubscription::whereIn('user_id', $ids)->exists()) {
            self::dispatch($ids, $message);
        }
    }

    public function handle(PushSender $sender): void
    {
        $sender->send(PushSubscription::whereIn('user_id', $this->userIds)->get(), $this->message);
    }
}
