<?php

use App\Models\ChatGroup;
use App\Models\ChatMessage;
use App\Models\Company;
use App\Services\Options;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('sends one-to-one messages with unread counts, read receipts and typing', function () {
    $company = Company::factory()->create();
    $asha = staffMember($company);
    $ravi = staffMember($company);
    $outsider = staffMember(Company::factory()->create());

    signIn($asha);
    $this->postJson("/api/chat/direct/{$ravi->id}", ['message' => 'Hello Ravi'])->assertCreated()->assertJsonPath('data.is_own', true);
    $this->postJson('/api/chat/typing', ['to' => "user:{$ravi->id}"])->assertOk();
    $this->postJson("/api/chat/direct/{$outsider->id}", ['message' => 'Hi'])->assertNotFound();

    signIn($ravi);
    $this->getJson('/api/chat/unread')->assertJsonPath('data.total', 1)->assertJsonPath('data.latest.text', 'Hello Ravi');
    $this->getJson('/api/chat/contacts')->assertJsonPath('staff.0.unread', 1)->assertJsonPath('staff.0.status', 'online')->assertJsonPath('staff.0.last_message.text', 'Hello Ravi');
    $first = $this->getJson("/api/chat/direct/{$asha->id}")->assertJsonCount(1, 'data')->assertJsonPath('meta.typing.0', $asha->full_name)->json('data.0.id');
    $this->getJson('/api/chat/unread')->assertJsonPath('data.total', 0);
    $this->postJson("/api/chat/direct/{$asha->id}", ['message' => 'Hi Asha'])->assertCreated();
    $this->deleteJson("/api/chat/messages/{$first}")->assertForbidden();

    signIn($asha);
    $this->getJson("/api/chat/direct/{$ravi->id}?after={$first}")->assertJsonCount(1, 'data')->assertJsonPath('data.0.message', 'Hi Asha')->assertJsonPath('meta.read_up_to', $first);
    $this->getJson('/api/chat/search?q=asha')->assertJsonCount(1, 'data')->assertJsonPath('data.0.conversation.key', "user:{$ravi->id}");
    $this->deleteJson("/api/chat/messages/{$first}")->assertOk();
    $this->postJson('/api/chat/status', ['status' => 'busy'])->assertOk();

    signIn($ravi);
    $this->getJson('/api/chat/contacts')->assertJsonPath('staff.0.status', 'busy');
});

it('runs group chats for their members only, with shared files', function () {
    Storage::fake('local');
    $company = Company::factory()->create();
    $owner = staffMember($company);
    $member = staffMember($company);
    $other = staffMember($company);

    signIn($owner);
    $group = $this->postJson('/api/chat/groups', ['name' => 'ERP team', 'member_ids' => [$member->id]])->assertCreated()->json('data.id');
    $sent = $this->post("/api/chat/groups/{$group}/messages", ['message' => 'Specs attached', 'files' => [UploadedFile::fake()->create('specs.pdf', 20, 'application/pdf')]], ['Accept' => 'application/json'])
        ->assertCreated()->assertJsonPath('data.files.0.original_name', 'specs.pdf')->json('data');

    signIn($member);
    $this->getJson('/api/chat/unread')->assertJsonPath('data.total', 1);
    $this->getJson("/api/chat/groups/{$group}/messages")->assertJsonPath('data.0.message', 'Specs attached')->assertJsonPath('meta.group.can_manage', false);
    $this->getJson('/api/chat/unread')->assertJsonPath('data.total', 0);
    $this->get($sent['files'][0]['download_url'])->assertOk();
    $this->getJson("/api/chat/files?with=group:{$group}")->assertJsonCount(1, 'data');
    $this->putJson("/api/chat/groups/{$group}", ['name' => 'Renamed'])->assertForbidden();

    signIn($other);
    $this->getJson("/api/chat/groups/{$group}/messages")->assertForbidden();
    $this->get($sent['files'][0]['download_url'])->assertForbidden();

    signIn($owner);
    $this->postJson("/api/chat/groups/{$group}/members", ['user_ids' => [$other->id]])->assertOk();
    signIn($other);
    $this->getJson("/api/chat/groups/{$group}/messages")->assertOk();
    $this->getJson('/api/chat/unread')->assertJsonPath('data.total', 0);
    $this->deleteJson("/api/chat/groups/{$group}/members/{$other->id}")->assertOk();
    $this->getJson("/api/chat/groups/{$group}/messages")->assertForbidden();

    signIn($owner);
    $this->deleteJson("/api/chat/groups/{$group}")->assertOk();
    expect(ChatGroup::count())->toBe(0)->and(ChatMessage::count())->toBe(0);
    Storage::disk('local')->assertDirectoryEmpty('attachments/'.$company->id.'/chat');
});

it('lets a customer chat with the team from the customers area, with files and read receipts', function () {
    Storage::fake('local');
    [$admin, $customer, $contact] = chatCustomerSetup();
    $sales = staffMember($admin->company, ['customers.view']);
    $plain = staffMember($admin->company);

    $headers = chatCustomerLogin($this);
    $this->getJson('/api/portal/me', $headers)->assertJsonPath('data.chat_enabled', true);
    $this->post('/api/portal/chat', ['message' => 'Need help with invoice', 'files' => [UploadedFile::fake()->create('voice-message.webm', 5, 'audio/webm')]], [...$headers, 'Accept' => 'application/json'])
        ->assertCreated()->assertJsonPath('data.is_own', true)->assertJsonPath('data.files.0.is_audio', true);
    $this->postJson('/api/portal/chat/typing', [], $headers)->assertOk();

    signIn($sales);
    $this->getJson('/api/chat/unread')->assertJsonPath('data.total', 1);
    $this->getJson('/api/chat/contacts')->assertJsonPath('customers.0.name', 'Asha')->assertJsonPath('customers.0.unread', 1);
    $this->getJson("/api/chat/customer/{$contact->id}")->assertJsonPath('data.0.from_contact', true)->assertJsonPath('data.0.sender_name', 'Asha')
        ->assertJsonPath('meta.typing.0', 'Asha')->assertJsonPath('meta.contact.customer.name', 'Acme');
    $reply = $this->postJson("/api/chat/customer/{$contact->id}", ['message' => 'Sure, checking'])->assertCreated()->json('data.id');
    $this->getJson('/api/chat/customer-contacts?q=acme')->assertJsonPath('data.0.id', $contact->id);

    signIn($plain);
    $this->getJson('/api/chat/contacts')->assertJsonPath('customers', null);
    $this->getJson("/api/chat/customer/{$contact->id}")->assertForbidden();

    app('auth')->forgetGuards();
    $this->getJson('/api/portal/chat/unread', $headers)->assertJsonPath('data.total', 1);
    $chat = $this->getJson('/api/portal/chat', $headers)->assertJsonCount(2, 'data')->assertJsonPath('data.1.sender_name', $sales->full_name)->json('data');
    $this->get($chat[0]['files'][0]['download_url'], $headers)->assertOk();
    $this->getJson('/api/portal/chat/unread', $headers)->assertJsonPath('data.total', 0);

    signIn($sales);
    $this->getJson("/api/chat/customer/{$contact->id}")->assertJsonPath('meta.read_up_to', $reply);

    Options::set('chat_clients_enabled', '0', $admin->company_id);
    app('auth')->forgetGuards();
    $this->getJson('/api/portal/chat', $headers)->assertForbidden();
});

it('sends admin announcements to all staff or all customers, and keeps each user\'s chat look', function () {
    [$admin, $customer, $contact] = chatCustomerSetup();
    $staff = staffMember($admin->company);

    signIn($staff);
    $this->postJson('/api/chat/announce', ['audience' => 'staff', 'message' => 'Office closed'])->assertForbidden();
    $this->postJson('/api/chat/settings', ['theme' => 'dark', 'color' => '#fa6010'])->assertOk();
    $this->getJson('/api/chat/contacts')->assertJsonPath('me.theme', 'dark')->assertJsonPath('me.color', '#fa6010')->assertJsonPath('can_announce', false);
    $this->postJson('/api/chat/settings', ['color' => 'red'])->assertJsonValidationErrors('color');

    signIn($admin);
    $this->postJson('/api/chat/announce', ['audience' => 'staff', 'message' => 'Office closed on Friday'])->assertOk()->assertJsonPath('count', 1);
    $this->postJson('/api/chat/announce', ['audience' => 'customers', 'message' => 'New portal is live'])->assertOk()->assertJsonPath('count', 1);

    signIn($staff);
    $this->getJson("/api/chat/direct/{$admin->id}")->assertJsonPath('data.0.is_announcement', true);
    $this->getJson('/api/chat/contacts')->assertJsonPath('staff.0.last_message.text', '📢 Office closed on Friday');

    app('auth')->forgetGuards();
    $this->getJson('/api/portal/chat', chatCustomerLogin($this))->assertJsonPath('data.0.message', 'New portal is live')->assertJsonPath('data.0.is_announcement', true);
});
