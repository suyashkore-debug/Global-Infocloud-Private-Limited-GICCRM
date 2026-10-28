<?php

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\PushSubscription;
use App\Services\PushSender;

beforeEach(function () {
    config(['services.webpush.public_key' => 'pub', 'services.webpush.private_key' => 'priv']);
    // Record pushes instead of calling the push services.
    $this->pushed = new ArrayObject;
    $pushed = $this->pushed;
    $this->app->instance(PushSender::class, new class($pushed) extends PushSender
    {
        public function __construct(private ArrayObject $pushed) {}

        public function send(iterable $subscriptions, array $message): void
        {
            foreach ($subscriptions as $s) {
                $this->pushed[] = ['user' => $s->user_id, ...$message];
            }
        }
    });
});

function subscribeDevice($test, string $endpoint): void
{
    $test->postJson('/api/push/subscribe', ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'key', 'auth' => 'secret']])->assertOk();
}

it('saves this device and sends it the bell notifications', function () {
    $company = Company::factory()->create();
    $asha = signIn(staffMember($company));
    $this->getJson('/api/push/key')->assertJsonPath('data.public_key', 'pub');
    $this->postJson('/api/push/subscribe', ['endpoint' => 'http://insecure.test/x', 'keys' => ['p256dh' => 'k', 'auth' => 'a']])->assertJsonValidationErrors('endpoint');
    subscribeDevice($this, 'https://push.example/asha-phone');
    subscribeDevice($this, 'https://push.example/asha-phone'); // same device again: still one
    expect(PushSubscription::where('user_id', $asha->id)->count())->toBe(1)
        ->and(PushSubscription::first()->toArray())->not->toHaveKey('auth_token');

    AppNotification::create(['company_id' => $company->id, 'user_id' => $asha->id, 'description' => 'assigned you a task', 'link' => '/tasks?task=5']);
    expect($this->pushed->getArrayCopy())->toHaveCount(1)
        ->and($this->pushed[0])->toMatchArray(['user' => $asha->id, 'url' => '/tasks?task=5'])
        ->and($this->pushed[0]['body'])->toContain('assigned you a task');

    $this->postJson('/api/push/unsubscribe', ['endpoint' => 'https://push.example/asha-phone'])->assertOk();
    expect(PushSubscription::count())->toBe(0);
});

it('pushes a chat message to the receiver, never the sender', function () {
    $company = Company::factory()->create();
    $ravi = signIn(staffMember($company));
    subscribeDevice($this, 'https://push.example/ravi');
    $asha = signIn(staffMember($company));
    subscribeDevice($this, 'https://push.example/asha');

    $this->postJson("/api/chat/direct/{$ravi->id}", ['message' => 'Lunch at 1?'])->assertCreated();
    expect(collect($this->pushed)->pluck('user')->all())->toBe([$ravi->id])
        ->and($this->pushed[0])->toMatchArray(['title' => $asha->full_name, 'body' => 'Lunch at 1?', 'url' => "/chat?with=user:{$asha->id}"]);
});

it('does nothing when nobody turned notifications on', function () {
    $company = Company::factory()->create();
    $asha = signIn(staffMember($company));
    AppNotification::create(['company_id' => $company->id, 'user_id' => $asha->id, 'description' => 'x']);
    expect($this->pushed->getArrayCopy())->toBe([]);
});
