<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Utilities → Activity Log (admins) and Media (the shared file library).
 */
class UtilitiesController extends Controller
{
    public function activityLog(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $logs = ActivityLog::query()
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where('description', 'like', "%{$s}%"))
            ->when($request->date('date'), fn ($q, $d) => $q->whereDate('created_at', $d))
            ->with('user')
            ->latest('created_at')->latest('id')
            ->paginate($request->integer('per_page', 50));

        return response()->json([
            'data' => collect($logs->items())->map(fn (ActivityLog $l) => ['id' => $l->id, 'description' => $l->description, 'user' => $l->user?->full_name, 'created_at' => $l->created_at]),
            'meta' => ['current_page' => $logs->currentPage(), 'last_page' => $logs->lastPage(), 'total' => $logs->total(), 'per_page' => $logs->perPage()],
        ]);
    }

    public function clearActivityLog(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        ActivityLog::query()->delete();

        return response()->json(['message' => 'Activity log cleared.']);
    }

    public function media(Request $request): JsonResponse
    {
        $folder = trim((string) $request->input('folder', ''), '/');

        return response()->json([
            'data' => Media::where('folder', $folder)->with('user')->latest()->get()->map(fn (Media $m) => [
                'id' => $m->id, 'original_name' => $m->original_name, 'mime_type' => $m->mime_type, 'size' => $m->size,
                'is_image' => str_starts_with((string) $m->mime_type, 'image/'), 'user' => $m->user?->full_name,
                'is_own' => (int) $m->user_id === (int) $request->user()->id, 'created_at' => $m->created_at,
            ]),
            'folders' => Media::where('folder', 'like', $folder === '' ? '%' : $folder.'/%')->where('folder', '!=', $folder)
                ->distinct()->pluck('folder')
                ->map(fn ($f) => explode('/', $folder === '' ? $f : substr($f, strlen($folder) + 1))[0])->unique()->values(),
        ]);
    }

    public function uploadMedia(Request $request): JsonResponse
    {
        $data = $request->validate([
            'folder' => ['nullable', 'string', 'max:191', 'regex:/^[\w\- \/]*$/'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => ['file', 'max:20480'],
        ]);
        $folder = trim((string) ($data['folder'] ?? ''), '/');

        foreach ($request->file('files') as $file) {
            Media::create([
                'folder' => $folder,
                'disk_path' => $file->store('media/'.$request->user()->company_id.($folder ? '/'.$folder : ''), 'local'),
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
                'user_id' => $request->user()->id,
            ]);
        }

        return response()->json(['message' => 'Uploaded.'], 201);
    }

    public function downloadMedia(Media $media): StreamedResponse
    {
        return response()->streamDownload(fn () => print Storage::disk('local')->get($media->disk_path), $media->original_name, ['Content-Type' => $media->mime_type ?: 'application/octet-stream']);
    }

    public function deleteMedia(Request $request, Media $media): JsonResponse
    {
        abort_unless((int) $media->user_id === (int) $request->user()->id || $request->user()->isAdmin(), 403);
        $media->delete();

        return response()->json(['message' => 'Deleted.']);
    }
}
