<?php

namespace App\Services;

use App\Models\Option;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Database backups (Perfex "Backup" module): a gzipped mysqldump of the whole app database in
 * storage/app/backups, made on demand or daily by the scheduler, and pruned after N days.
 * The dump holds every company's data, so only super admins reach it; its settings are
 * system-wide (stored as options of company 0).
 */
class Backups
{
    public const SYSTEM_COMPANY = 0;

    /** Perfex's backup settings, with GIC's values as defaults. */
    public const DEFAULTS = [
        'auto_backup_enabled' => '1',
        'auto_backup_every' => '1',
        'auto_backup_hour' => '23',
        'delete_backups_older_then' => '10',
        'last_auto_backup' => '',
    ];

    /** Backup times (file names, "hour of day") are India time, like the rest of GIC's screens. */
    private const TZ = 'Asia/Kolkata';

    private const NAME = '/^backup-\d{4}-\d{2}-\d{2}-\d{6}\.sql\.gz$/';

    public static function dir(): string
    {
        return storage_path('app/backups');
    }

    /** @return array<string, string> */
    public static function settings(): array
    {
        $saved = Option::withoutGlobalScopes()->where('company_id', self::SYSTEM_COMPANY)->whereIn('name', array_keys(self::DEFAULTS))->pluck('value', 'name')->all();

        return array_map('strval', [...self::DEFAULTS, ...array_filter($saved, fn ($v) => $v !== null)]);
    }

    public static function set(string $name, string $value): void
    {
        Option::withoutGlobalScopes()->updateOrCreate(['company_id' => self::SYSTEM_COMPANY, 'name' => $name], ['value' => $value]);
    }

    /**
     * Newest first.
     *
     * @return array<int, array{name: string, size: int, created_at: string}>
     */
    public static function list(): array
    {
        if (! is_dir(self::dir())) {
            return [];
        }

        return collect(File::files(self::dir()))
            ->filter(fn ($f) => preg_match(self::NAME, $f->getFilename()))
            ->sortByDesc(fn ($f) => $f->getMTime())
            ->map(fn ($f) => ['name' => $f->getFilename(), 'size' => $f->getSize(), 'created_at' => date(DATE_ATOM, $f->getMTime())])
            ->values()
            ->all();
    }

    /** The full path of a backup, or null for anything that isn't one (no path tricks). */
    public static function path(string $name): ?string
    {
        $path = self::dir().'/'.$name;

        return preg_match(self::NAME, $name) && is_file($path) ? $path : null;
    }

    /**
     * Dump the database now. Returns the new file's name.
     */
    public static function create(): string
    {
        File::ensureDirectoryExists(self::dir(), 0750);
        $db = config('database.connections.'.config('database.default'));
        if (($db['driver'] ?? '') !== 'mysql' && ($db['driver'] ?? '') !== 'mariadb') {
            throw new RuntimeException('Backups need a MySQL database.');
        }

        $name = 'backup-'.now(self::TZ)->format('Y-m-d-His').'.sql.gz';
        $sql = self::dir().'/'.$name.'.tmp';
        // The password goes in the environment, not on the command line (other users can see that).
        $result = Process::env(['MYSQL_PWD' => (string) $db['password']])->timeout(1800)->run([
            'mysqldump',
            '--host='.$db['host'],
            '--port='.$db['port'],
            '--user='.$db['username'],
            '--single-transaction',
            '--quick',
            '--no-tablespaces',
            '--default-character-set=utf8mb4',
            '--result-file='.$sql,
            $db['database'],
        ]);
        if (! $result->successful()) {
            @unlink($sql);
            throw new RuntimeException('The database dump failed: '.trim($result->errorOutput() ?: $result->output()));
        }

        self::gzip($sql, self::dir().'/'.$name);
        @unlink($sql);

        return $name;
    }

    public static function delete(string $name): bool
    {
        $path = self::path($name);

        return $path !== null && unlink($path);
    }

    /** Delete backups older than "Delete backups older than X days" (0 = keep all). */
    public static function prune(): int
    {
        $days = (int) self::settings()['delete_backups_older_then'];
        if ($days <= 0) {
            return 0;
        }
        $cutoff = now()->subDays($days)->getTimestamp();
        $deleted = 0;
        foreach (self::list() as $backup) {
            if (strtotime($backup['created_at']) < $cutoff && self::delete($backup['name'])) {
                $deleted++;
            }
        }

        return $deleted;
    }

    /**
     * Scheduler (hourly), as Perfex's cron: once the hour of day is reached, back up when the last
     * automatic backup is "every N days" old, then prune old ones. Returns the new file or null.
     */
    public static function runAutomatic(): ?string
    {
        $s = self::settings();
        if ($s['auto_backup_enabled'] !== '1' || (int) now(self::TZ)->format('G') < (int) $s['auto_backup_hour']) {
            return null;
        }
        $every = max(1, (int) $s['auto_backup_every']);
        if ($s['last_auto_backup'] !== '' && now(self::TZ)->startOfDay()->diffInDays(Carbon::parse($s['last_auto_backup'], self::TZ)->startOfDay(), true) < $every) {
            return null;
        }

        $name = self::create();
        self::set('last_auto_backup', now(self::TZ)->toDateTimeString());
        self::prune();

        return $name;
    }

    private static function gzip(string $from, string $to): void
    {
        $in = fopen($from, 'rb');
        $out = gzopen($to, 'wb6');
        if (! $in || ! $out) {
            throw new RuntimeException('Could not write the backup file.');
        }
        while (! feof($in)) {
            gzwrite($out, (string) fread($in, 1 << 20));
        }
        fclose($in);
        gzclose($out);
        chmod($to, 0640);
    }
}
