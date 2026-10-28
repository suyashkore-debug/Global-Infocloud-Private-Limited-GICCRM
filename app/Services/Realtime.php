<?php

namespace App\Services;

use App\Models\ChatGroupMember;
use App\Models\ChatMessage;
use Illuminate\Contracts\Broadcasting\Factory as Broadcasting;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Live updates over the HRMS Reverb server. Events carry no record data, only "what changed"
 * (e.g. a conversation key); the browser reloads it through the normal API, so every permission
 * check stays where it is. A stopped Reverb only means screens fall back to polling.
 *
 * Channels (all private): projects.user.{id} (a staff member), projects.contact.{id} (a customers
 * area contact), projects.company.{id}.customers (staff who chat with that company's customers).
 *
 * During a web request events are collected and published after the response, merged (one
 * publish per event for up to 100 channels), so a broadcast to everyone costs one call.
 */
class Realtime
{
    /** @var array<string, array{event: string, data: array<string, mixed>, channels: array<string, true>}> */
    private static array $pending = [];

    private static bool $flushRegistered = false;

    /**
     * @param  iterable<int>  $userIds
     * @param  array<string, mixed>  $data
     */
    public static function toUsers(iterable $userIds, string $event, array $data = []): void
    {
        foreach ($userIds as $id) {
            if ((int) $id > 0) {
                self::queue('private-projects.user.'.(int) $id, $event, $data);
            }
        }
    }

    /** @param  array<string, mixed>  $data */
    public static function toContact(int $contactId, string $event, array $data = []): void
    {
        self::queue("private-projects.contact.{$contactId}", $event, $data);
    }

    /** @param  array<string, mixed>  $data */
    public static function toCustomerChatStaff(int $companyId, string $event, array $data = []): void
    {
        self::queue("private-projects.company.{$companyId}.customers", $event, $data);
    }

    /**
     * A chat message was sent or deleted: tell everyone who sees that conversation, each with the
     * conversation key as it appears on their side.
     */
    public static function chatChanged(ChatMessage $m): void
    {
        if ($m->chat_group_id) {
            self::toUsers(ChatGroupMember::where('chat_group_id', $m->chat_group_id)->pluck('user_id'), 'chat', ['conversation' => "group:{$m->chat_group_id}"]);
        } elseif ($m->contact_id) {
            self::toContact((int) $m->contact_id, 'chat', ['conversation' => 'staff']);
            self::toCustomerChatStaff((int) $m->company_id, 'chat', ['conversation' => "contact:{$m->contact_id}"]);
        } elseif ($m->receiver_id) {
            self::toUsers([$m->receiver_id], 'chat', ['conversation' => "user:{$m->sender_id}"]);
            self::toUsers([$m->sender_id], 'chat', ['conversation' => "user:{$m->receiver_id}"]);
        }
    }

    /** Publish everything collected so far (also called after each web response). */
    public static function flush(): void
    {
        $pending = self::$pending;
        self::$pending = [];
        // After a failure, skip Reverb for a minute so a stopped server doesn't add a timeout to
        // every request (and a log line for each).
        if ($pending === [] || Cache::has('realtime:down')) {
            return;
        }
        try {
            foreach ($pending as $item) {
                // Reverb (Pusher protocol) takes at most 100 channels per publish.
                foreach (array_chunk(array_keys($item['channels']), 100) as $chunk) {
                    app(Broadcasting::class)->connection()->broadcast($chunk, $item['event'], $item['data']);
                }
            }
        } catch (Throwable $e) {
            Cache::put('realtime:down', true, 60);
            report($e);
        }
    }

    /** @param  array<string, mixed>  $data */
    private static function queue(string $channel, string $event, array $data): void
    {
        $key = $event.'|'.json_encode($data);
        self::$pending[$key] ??= ['event' => $event, 'data' => $data, 'channels' => []];
        self::$pending[$key]['channels'][$channel] = true;

        if (app()->runningInConsole()) {
            // Queue jobs, scheduled commands (and tests) have no response to wait for.
            self::flush();
        } elseif (! self::$flushRegistered) {
            self::$flushRegistered = true;
            app()->terminating(function () {
                self::$flushRegistered = false;
                self::flush();
            });
        }
    }
}
