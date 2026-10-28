<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\DiscussionComment;
use App\Models\Project;
use App\Models\Task;
use App\Models\TicketReply;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Project files and task attachments: uploads (stored privately) and external links.
 */
class AttachmentController extends Controller
{
    /** Same upload limit for every file: 20 MB. */
    private const MAX_KB = 20480;

    public function projectFiles(Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        return AttachmentResource::collection($project->files()->with('user')->latest()->get());
    }

    public function uploadToProject(Request $request, Project $project): JsonResponse
    {
        $this->authorize('contribute', $project);
        $files = $this->validatedFiles($request);

        $saved = collect($files)->map(fn (UploadedFile $file) => $this->store($file, $project, $project->id));
        $project->logActivity('project_activity_uploaded_file', $saved->pluck('original_name')->implode(', '));

        return AttachmentResource::collection($saved->each->load('user'))->response()->setStatusCode(201);
    }

    public function linkToProject(Request $request, Project $project): AttachmentResource
    {
        $this->authorize('contribute', $project);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'external_link' => ['required', 'url', 'max:2000'],
        ]);

        $attachment = $project->files()->create([
            'attachable_type' => Project::class,
            'attachable_id' => $project->id,
            'user_id' => Auth::id(),
            'original_name' => $data['name'],
            'external_link' => $data['external_link'],
        ]);
        $project->logActivity('project_activity_uploaded_file', $data['name']);

        return new AttachmentResource($attachment->load('user'));
    }

    public function uploadToTask(Request $request, Task $task): JsonResponse
    {
        $this->authorize('comment', $task);
        $files = $this->validatedFiles($request);

        $saved = collect($files)->map(fn (UploadedFile $file) => $this->store($file, $task, $task->project_id));
        $task->project?->logActivity('project_activity_new_task_attachment', $task->name);

        return AttachmentResource::collection($saved->each->load('user'))->response()->setStatusCode(201);
    }

    public function update(Request $request, Attachment $attachment): AttachmentResource
    {
        $this->authorizeOwnerOrEditor($request, $attachment);
        $attachment->update($request->validate([
            'subject' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:5000'],
        ]));

        return new AttachmentResource($attachment->load('user'));
    }

    public function download(Attachment $attachment): StreamedResponse
    {
        $this->authorizeView($attachment);
        abort_unless($attachment->disk_path, 404);

        return response()->streamDownload(
            fn () => print Storage::disk('local')->get($attachment->disk_path),
            $attachment->original_name,
            ['Content-Type' => $attachment->mime_type ?: 'application/octet-stream'],
        );
    }

    public function destroy(Request $request, Attachment $attachment): JsonResponse
    {
        $this->authorizeOwnerOrEditor($request, $attachment);

        if ($attachment->attachable instanceof Project) {
            $attachment->attachable->logActivity('project_activity_project_file_removed', $attachment->original_name);
        }
        $attachment->delete();

        return response()->json(['message' => 'File deleted.']);
    }

    /**
     * @return array<int, UploadedFile>
     */
    private function validatedFiles(Request $request): array
    {
        $request->validate([
            'files' => ['required', 'array', 'max:10'],
            'files.*' => ['file', 'max:'.self::MAX_KB],
        ]);

        return $request->file('files');
    }

    private function store(UploadedFile $file, Project|Task $owner, ?int $projectId): Attachment
    {
        $folder = ($owner instanceof Project ? 'projects/' : 'tasks/').$owner->id;

        return $owner instanceof Project
            ? $owner->files()->create($this->fileRow($file, $folder, Project::class, $owner->id, $projectId))
            : $owner->attachments()->create($this->fileRow($file, $folder, Task::class, $owner->id, $projectId));
    }

    /**
     * @return array<string, mixed>
     */
    private function fileRow(UploadedFile $file, string $folder, string $type, int $id, ?int $projectId): array
    {
        return [
            'attachable_type' => $type,
            'attachable_id' => $id,
            'project_id' => $projectId,
            'user_id' => Auth::id(),
            'disk_path' => $file->store('attachments/'.Auth::user()->company_id.'/'.$folder, 'local'),
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
        ];
    }

    private function authorizeView(Attachment $attachment): void
    {
        $this->authorize('view', $this->owner($attachment));
    }

    private function authorizeOwnerOrEditor(Request $request, Attachment $attachment): void
    {
        $isOwner = (int) $attachment->user_id === (int) $request->user()->id;

        abort_unless($isOwner || $request->user()->can('update', $this->owner($attachment)), 403);
    }

    /**
     * The record whose rights decide access: the parent itself, or the project / ticket of a
     * discussion comment / ticket reply.
     */
    private function owner(Attachment $attachment): Model
    {
        $owner = $attachment->attachable;
        abort_unless($owner !== null, 404);

        return match (true) {
            $owner instanceof DiscussionComment => $owner->discussion->project,
            $owner instanceof TicketReply => $owner->ticket,
            default => $owner,
        };
    }
}
