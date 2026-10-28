<?php

use App\Models\AppNotification;
use App\Models\SupportDepartment;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('posts to everyone, notifies staff, and handles likes and comments', function () {
    Storage::fake('local');
    $admin = companyAdmin();
    $author = staffMember($admin->company);
    $reader = staffMember($admin->company);
    signIn($author);

    $post = $this->post('/api/newsfeed', ['content' => 'Diwali party on Friday!', 'files' => [UploadedFile::fake()->image('poster.png')]], ['Accept' => 'application/json'])
        ->assertCreated()->assertJsonPath('data.attachments.0.is_image', true)->json('data.id');
    expect(AppNotification::where('user_id', $reader->id)->where('description', 'published a new post')->count())->toBe(1);

    signIn($reader);
    $this->getJson('/api/newsfeed')->assertJsonPath('data.0.id', $post);
    $this->postJson("/api/newsfeed/{$post}/like")->assertJsonPath('data.likes_count', 1)->assertJsonPath('data.liked', true);
    $this->postJson("/api/newsfeed/{$post}/like")->assertJsonPath('data.likes_count', 1);
    $comment = $this->postJson("/api/newsfeed/{$post}/comments", ['content' => 'Great!'])->assertCreated()->json('data.comments.0.id');
    $this->deleteJson("/api/newsfeed/{$post}")->assertForbidden();
    $this->getJson("/api/newsfeed/{$post}/likes")->assertJsonPath('data.0.id', $reader->id);
    expect(AppNotification::where('user_id', $author->id)->pluck('description')->all())->toContain('likes your post', 'commented on your post');

    signIn($author);
    $this->postJson("/api/newsfeed-comments/{$comment}/like")->assertJsonPath('data.comments.0.likes_count', 1);
    $this->deleteJson("/api/newsfeed-comments/{$comment}")->assertJsonCount(0, 'data.comments');
    $this->postJson("/api/newsfeed/{$post}/pin")->assertForbidden();

    signIn($admin);
    $this->postJson("/api/newsfeed/{$post}/pin")->assertOk();
    $this->getJson('/api/newsfeed')->assertJsonPath('data.0.pinned', true);
    $this->deleteJson("/api/newsfeed/{$post}")->assertOk();
});

it('shows a department post only to that department, its author and admins', function () {
    $admin = companyAdmin();
    $author = staffMember($admin->company);
    $member = staffMember($admin->company);
    $outsider = staffMember($admin->company);
    $sales = SupportDepartment::create(['company_id' => $admin->company_id, 'name' => 'Sales']);
    $sales->syncMembers([$member->id]);

    signIn($author);
    $post = $this->postJson('/api/newsfeed', ['content' => 'Sales target', 'visibility' => [$sales->id]])
        ->assertCreated()->assertJsonPath('data.visibility.0', 'Sales')->json('data.id');
    expect(AppNotification::where('user_id', $outsider->id)->count())->toBe(0)
        ->and(AppNotification::where('user_id', $member->id)->count())->toBe(1);

    signIn($member);
    $this->getJson('/api/newsfeed')->assertJsonCount(1, 'data');
    signIn($outsider);
    $this->getJson('/api/newsfeed')->assertJsonCount(0, 'data');
    $this->postJson("/api/newsfeed/{$post}/comments", ['content' => 'x'])->assertForbidden();
    signIn($admin);
    $this->getJson('/api/newsfeed')->assertJsonCount(1, 'data');
});
