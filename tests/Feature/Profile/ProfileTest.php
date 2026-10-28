<?php

use App\Models\Customer;
use App\Models\Project;
use App\Models\StaffProfile;
use App\Models\Task;
use App\Models\TaskTimer;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

it('shows my profile with photo, logged time and projects', function () {
    $admin = signIn(companyAdmin());
    $admin->forceFill(['profile_photo' => 'profile_photos/me.jpg'])->save();
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $project->members()->create(['user_id' => $admin->id]);
    $task = Task::factory()->for($project)->create();
    TaskTimer::create(['task_id' => $task->id, 'user_id' => $admin->id, 'start_time' => now()->subHour(), 'end_time' => now()]);

    $this->getJson('/api/profile')->assertOk()
        ->assertJsonPath('data.photo_url', 'http://127.0.0.1:8002/storage/profile_photos/me.jpg')
        ->assertJsonPath('data.logged_time.total', 3600)
        ->assertJsonPath('data.projects.0.id', $project->id);
});

it('hides another member\'s logged time from non-admins', function () {
    $admin = companyAdmin();
    signIn(staffMember($admin->company));

    $this->getJson("/api/profile/{$admin->id}")->assertOk()->assertJsonPath('data.logged_time', null)->assertJsonPath('data.is_own', false);
});

it('saves the name in HRMS with the user\'s token and keeps social links here', function () {
    $admin = signIn(companyAdmin());
    Http::fake(['hrms.test/*' => Http::response(['status' => true, 'message' => 'Profile updated successfully.'])]);

    $this->withToken('hrms-token')->putJson('/api/profile', [
        'first_name' => 'Suyash', 'last_name' => 'Kore', 'mobile' => '9999999999', 'linkedin' => 'https://linkedin.com/in/x',
    ])->assertOk();

    Http::assertSent(fn (Request $r) => $r->url() === 'http://hrms.test/api/v1/profile/update' && $r->method() === 'PATCH'
        && $r['firstname'] === 'Suyash' && $r->hasHeader('Authorization', 'Bearer hrms-token'));
    expect(StaffProfile::where('user_id', $admin->id)->value('linkedin'))->toBe('https://linkedin.com/in/x');
});

it('relays HRMS errors when changing the password', function () {
    signIn(companyAdmin());
    Http::fake(['hrms.test/*' => Http::response(['status' => false, 'message' => 'Old password is incorrect.'], 400)]);

    $this->postJson('/api/profile/password', ['old_password' => 'x', 'new_password' => 'newpass123', 'new_password_confirmation' => 'newpass123'])
        ->assertUnprocessable()->assertJsonPath('message', 'Old password is incorrect.');
    $this->postJson('/api/profile/password', ['old_password' => 'x', 'new_password' => 'newpass123', 'new_password_confirmation' => 'other'])
        ->assertJsonValidationErrors('new_password');
});

it('sends a new photo to HRMS as base64', function () {
    signIn(companyAdmin());
    Http::fake(['hrms.test/*' => Http::response(['status' => true, 'data' => ['photo_path' => 'profile_photos/a.png']])]);

    $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->image('me.png', 50, 50)], ['Accept' => 'application/json'])->assertOk();
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/profile/change-photo') && str_starts_with($r['photo'], 'data:image/png;base64,'));
});

it('lists my timesheets for a range and everyone\'s with the reports permission', function () {
    $admin = companyAdmin();
    $me = signIn(staffMember($admin->company));
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $task = Task::factory()->for($project)->create();
    TaskTimer::create(['task_id' => $task->id, 'user_id' => $me->id, 'start_time' => now()->startOfDay()->addHour(), 'end_time' => now()->startOfDay()->addHours(3)]);
    TaskTimer::create(['task_id' => $task->id, 'user_id' => $admin->id, 'start_time' => now()->startOfDay()->addHour(), 'end_time' => now()->startOfDay()->addHours(2)]);

    $this->getJson('/api/my-timesheets?range=today')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('meta.total_seconds', 7200)->assertJsonPath('meta.can_view_all', false);
    $this->getJson('/api/my-timesheets?range=today&view_all=1')->assertJsonCount(1, 'data');

    signIn($admin);
    $this->getJson('/api/my-timesheets?range=this_month&view_all=1')->assertJsonCount(2, 'data')->assertJsonPath('meta.total_seconds', 10800);
    $this->getJson('/api/my-timesheets?range=this_month&view_all=1&group_by_task=1')->assertJsonCount(2, 'data');
});
