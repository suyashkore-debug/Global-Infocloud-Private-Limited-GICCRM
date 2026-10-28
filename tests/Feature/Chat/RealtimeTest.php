<?php

use App\Models\AppNotification;
use App\Models\ChatGroup;
use App\Models\ChatGroupMember;
use App\Models\Company;
use App\Services\Options;
use Illuminate\Broadcasting\Broadcasters\Broadcaster;
use Illuminate\Support\Facades\Broadcast;

/** Captures what Realtime publishes: [channels, event, data] per call. */
function captureBroadcasts(): ArrayObject
{
    $sent = new ArrayObject;
    Broadcast::extend('capture', fn () => new class($sent) extends Broadcaster
    {
        public function __construct(private ArrayObject $sent) {}

        public function auth($request) {}

        public function validAuthenticationResponse($request, $result) {}

        public function broadcast(array $channels, $event, array $payload = []): void
        {
            $this->sent[] = [array_map('strval', $channels), $event, $payload];
        }
    });
    config(['broadcasting.connections.capture' => ['driver' => 'capture'], 'broadcasting.default' => 'capture']);

    return $sent;
}

function sentTo(ArrayObject $sent, string $channel, string $event): array
{
    return collect($sent)->filter(fn ($s) => in_array($channel, $s[0], true) && $s[1] === $event)->pluck(2)->values()->all();
}

it('tells both sides of a chat, the group and the bell at once', function () {
    $sent = captureBroadcasts();
    $company = Company::factory()->create();
    $asha = staffMember($company);
    $ravi = staffMember($company);

    signIn($asha);
    $this->postJson("/api/chat/direct/{$ravi->id}", ['message' => 'Hi'])->assertCreated();
    expect(sentTo($sent, "private-projects.user.{$ravi->id}", 'chat'))->toBe([['conversation' => "user:{$asha->id}"]])
        ->and(sentTo($sent, "private-projects.user.{$asha->id}", 'chat'))->toBe([['conversation' => "user:{$ravi->id}"]]);

    $this->postJson('/api/chat/typing', ['to' => "user:{$ravi->id}"])->assertOk();
    expect(sentTo($sent, "private-projects.user.{$ravi->id}", 'typing')[0])->toBe(['conversation' => "user:{$asha->id}", 'name' => $asha->full_name]);

    // Ravi reads it: Asha's "Seen" updates.
    $sent->exchangeArray([]);
    signIn($ravi);
    $this->getJson("/api/chat/direct/{$asha->id}")->assertOk();
    expect(sentTo($sent, "private-projects.user.{$asha->id}", 'chat'))->toBe([['conversation' => "user:{$ravi->id}"]]);

    $group = ChatGroup::create(['company_id' => $company->id, 'name' => 'Ops', 'created_by' => $ravi->id]);
    ChatGroupMember::insert([['chat_group_id' => $group->id, 'user_id' => $ravi->id], ['chat_group_id' => $group->id, 'user_id' => $asha->id]]);
    $sent->exchangeArray([]);
    $this->postJson("/api/chat/groups/{$group->id}/messages", ['message' => 'Team'])->assertCreated();
    expect(sentTo($sent, "private-projects.user.{$asha->id}", 'chat'))->toBe([['conversation' => "group:{$group->id}"]]);

    AppNotification::create(['company_id' => $company->id, 'user_id' => $asha->id, 'description' => 'x']);
    expect(sentTo($sent, "private-projects.user.{$asha->id}", 'notification'))->toHaveCount(1);
});

it('tells the customer and the customer-chat staff, never the payload', function () {
    $sent = captureBroadcasts();
    [$admin, $customer, $contact] = chatCustomerSetup();
    Options::set('chat_clients_enabled', '1', $admin->company_id);
    $headers = chatCustomerLogin($this);

    $this->postJson('/api/portal/chat', ['message' => 'Secret question'], $headers)->assertCreated();
    expect(sentTo($sent, "private-projects.company.{$admin->company_id}.customers", 'chat'))->toBe([['conversation' => "contact:{$contact->id}"]])
        ->and(sentTo($sent, "private-projects.contact.{$contact->id}", 'chat'))->toBe([['conversation' => 'staff']])
        ->and(json_encode($sent->getArrayCopy()))->not->toContain('Secret question');
});

it('signs only the channels a person may listen on', function () {
    config(['broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's']);
    [$admin, $customer, $contact] = chatCustomerSetup();
    $plain = staffMember($admin->company);
    $other = companyAdmin();
    $socket = '123.456';

    signIn($plain);
    $own = "private-projects.user.{$plain->id}";
    $this->postJson('/api/realtime/auth', ['socket_id' => $socket, 'channel_name' => $own])->assertOk()->assertJsonPath('auth', 'k:'.hash_hmac('sha256', "{$socket}:{$own}", 's'));
    $this->postJson('/api/realtime/auth', ['socket_id' => $socket, 'channel_name' => "private-projects.user.{$admin->id}"])->assertForbidden();
    $this->postJson('/api/realtime/auth', ['socket_id' => $socket, 'channel_name' => "private-projects.company.{$admin->company_id}.customers"])->assertForbidden();
    $this->postJson('/api/realtime/auth', ['socket_id' => 'x', 'channel_name' => $own])->assertJsonValidationErrors('socket_id');

    signIn($admin);
    $this->postJson('/api/realtime/auth', ['socket_id' => $socket, 'channel_name' => "private-projects.company.{$admin->company_id}.customers"])->assertOk();
    $this->postJson('/api/realtime/auth', ['socket_id' => $socket, 'channel_name' => "private-projects.company.{$other->company_id}.customers"])->assertForbidden();

    $headers = chatCustomerLogin($this);
    $this->postJson('/api/portal/realtime/auth', ['socket_id' => $socket, 'channel_name' => "private-projects.contact.{$contact->id}"], $headers)->assertOk();
    $this->postJson('/api/portal/realtime/auth', ['socket_id' => $socket, 'channel_name' => 'private-projects.contact.'.($contact->id + 1)], $headers)->assertForbidden();
});
