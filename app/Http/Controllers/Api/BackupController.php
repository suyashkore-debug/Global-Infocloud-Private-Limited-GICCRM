<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Backups;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

/**
 * Setup → Backup. A backup holds every company's data, so this is for super admins only.
 */
class BackupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->allow($request);

        return response()->json(['data' => Backups::list(), 'settings' => Backups::settings()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->allow($request);
        try {
            $name = Backups::create();
        } catch (Throwable $e) {
            report($e);

            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Backup created.', 'name' => $name, 'data' => Backups::list()], 201);
    }

    public function download(Request $request, string $name): BinaryFileResponse
    {
        $this->allow($request);
        $path = Backups::path($name);
        abort_unless($path !== null, 404);

        return response()->download($path, $name, ['Content-Type' => 'application/gzip']);
    }

    public function destroy(Request $request, string $name): JsonResponse
    {
        $this->allow($request);
        abort_unless(Backups::delete($name), 404);

        return response()->json(['message' => 'Backup deleted.', 'data' => Backups::list()]);
    }

    public function settings(Request $request): JsonResponse
    {
        $this->allow($request);
        $data = $request->validate([
            'auto_backup_enabled' => ['required', 'in:0,1'],
            'auto_backup_every' => ['required', 'integer', 'min:1', 'max:365'],
            'auto_backup_hour' => ['required', 'integer', 'min:0', 'max:23'],
            'delete_backups_older_then' => ['required', 'integer', 'min:0', 'max:3650'],
        ]);
        foreach ($data as $name => $value) {
            Backups::set($name, (string) $value);
        }

        return response()->json(['message' => 'Backup settings saved.', 'settings' => Backups::settings()]);
    }

    private function allow(Request $request): void
    {
        abort_unless((bool) $request->user()->is_super_admin, 403, 'Only super admins can manage backups.');
    }
}
