<?php

use App\Services\Backups;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

beforeEach(function () {
    // Tests write to their own folder and never run the real mysqldump.
    $this->backupStorage = storage_path('framework/testing/backup-'.uniqid());
    $this->app->useStoragePath($this->backupStorage);
    Process::fake(function (PendingProcess $process) {
        $file = collect($process->command)->first(fn ($arg) => str_starts_with($arg, '--result-file='));
        file_put_contents(substr($file, strlen('--result-file=')), "-- dump\nCREATE TABLE t (id int);\n");

        return Process::result();
    });
});

afterEach(fn () => File::deleteDirectory($this->backupStorage));

it('lets only super admins make, list, download and delete backups', function () {
    $admin = companyAdmin();
    signIn($admin);
    $this->getJson('/api/setup/backups')->assertForbidden();
    $this->postJson('/api/setup/backups')->assertForbidden();

    $admin->forceFill(['is_super_admin' => true])->save();
    $name = $this->postJson('/api/setup/backups')->assertCreated()->json('name');
    expect($name)->toMatch('/^backup-\d{4}-\d{2}-\d{2}-\d{6}\.sql\.gz$/')
        ->and(gzdecode(file_get_contents(Backups::path($name))))->toContain('CREATE TABLE t');
    Process::assertRan(fn (PendingProcess $p) => $p->command[0] === 'mysqldump' && ! collect($p->command)->contains(fn ($a) => str_contains($a, '--password')));

    $this->getJson('/api/setup/backups')->assertOk()->assertJsonPath('data.0.name', $name)->assertJsonPath('settings.auto_backup_hour', '23');
    $this->get("/api/setup/backups/{$name}")->assertOk()->assertDownload($name);
    $this->get('/api/setup/backups/..%2F.env')->assertNotFound();

    $this->deleteJson("/api/setup/backups/{$name}")->assertOk()->assertJsonCount(0, 'data');
});

it('backs up automatically once a day at the chosen hour and prunes old backups', function () {
    $admin = companyAdmin();
    $admin->forceFill(['is_super_admin' => true])->save();
    signIn($admin);
    $this->putJson('/api/setup/backups/settings', ['auto_backup_enabled' => '1', 'auto_backup_every' => 1, 'auto_backup_hour' => 25, 'delete_backups_older_then' => 3])->assertJsonValidationErrors('auto_backup_hour');
    $this->putJson('/api/setup/backups/settings', ['auto_backup_enabled' => '1', 'auto_backup_every' => 1, 'auto_backup_hour' => 22, 'delete_backups_older_then' => 3])->assertOk();

    $this->travelTo(now('Asia/Kolkata')->setTime(21, 0));
    expect(Backups::runAutomatic())->toBeNull();

    $this->travelTo(now('Asia/Kolkata')->setTime(22, 30));
    $first = Backups::runAutomatic();
    expect($first)->not->toBeNull()
        ->and(Backups::runAutomatic())->toBeNull(); // already done today

    touch(Backups::path($first), now()->subDays(5)->getTimestamp());
    $this->travelTo(now('Asia/Kolkata')->addDay()->setTime(23, 0));
    $second = Backups::runAutomatic();
    expect($second)->not->toBeNull()
        ->and(Backups::path($first))->toBeNull()
        ->and(collect(Backups::list())->pluck('name')->all())->toBe([$second]);

    $this->putJson('/api/setup/backups/settings', ['auto_backup_enabled' => '0', 'auto_backup_every' => 1, 'auto_backup_hour' => 0, 'delete_backups_older_then' => 3])->assertOk();
    $this->travelTo(now('Asia/Kolkata')->addDays(2));
    expect(Backups::runAutomatic())->toBeNull();
});
