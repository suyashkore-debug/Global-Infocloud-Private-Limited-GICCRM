<?php

use App\Models\Todo;

it('keeps to do items private and moves them between lists', function () {
    $admin = companyAdmin();
    $me = signIn(staffMember($admin->company));
    $a = $this->postJson('/api/todos', ['description' => 'Call client'])->assertCreated()->json('data.id');
    $b = $this->postJson('/api/todos', ['description' => 'Send invoice'])->assertCreated()->json('data.id');

    $this->getJson('/api/todos')->assertJsonCount(2, 'data')->assertJsonPath('meta.unfinished', 2);
    $this->patchJson("/api/todos/{$a}", ['finished' => true])->assertJsonPath('data.finished', true);
    expect(Todo::find($a)->finished_at)->not->toBeNull();
    $this->getJson('/api/todos/count')->assertJsonPath('data.unfinished', 1);

    // Drag "Send invoice" into the finished list above "Call client".
    $this->postJson('/api/todos/reorder', ['finished' => true, 'order' => [$b, $a]])->assertOk();
    $this->getJson('/api/todos?finished=1')->assertJsonPath('data.0.id', $b)->assertJsonPath('data.1.id', $a);

    signIn($admin);
    $this->getJson('/api/todos?finished=1')->assertJsonCount(0, 'data');
    $this->patchJson("/api/todos/{$a}", ['finished' => false])->assertNotFound();
    $this->deleteJson("/api/todos/{$a}")->assertNotFound();

    signIn($me);
    $this->deleteJson("/api/todos/{$a}")->assertOk();
});
