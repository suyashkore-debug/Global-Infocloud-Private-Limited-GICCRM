<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommentResource;
use App\Http\Resources\DiscussionResource;
use App\Models\Discussion;
use App\Models\DiscussionComment;
use App\Models\Project;
use App\Services\Emails;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Project discussions with threaded comments (replies) and attachments.
 */
class DiscussionController extends Controller
{
    public function __construct(private Notifier $notifier) {}

    public function index(Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        return DiscussionResource::collection(
            $project->discussions()->with('user')->withCount('comments')->latest('last_activity_at')->latest()->get()
        );
    }

    public function store(Request $request, Project $project): DiscussionResource
    {
        $this->authorize('contribute', $project);
        $data = $this->validateDiscussion($request);

        $discussion = $project->discussions()->create([...$data, 'user_id' => $request->user()->id, 'last_activity_at' => now()]);
        $project->logActivity('project_activity_created_discussion', $discussion->subject);
        $this->notifier->notify($project->members()->pluck('user_id'), "created discussion {$discussion->subject} in project {$project->name}", $this->link($discussion));
        Emails::toStaff('new-project-discussion-created-to-staff', (int) $project->company_id, $project->members()->pluck('user_id'), [
            ...Emails::project($project), ...$this->discussionFields($discussion), 'discussion_creator' => $request->user()->full_name,
        ], $project);

        return new DiscussionResource($discussion->load('user')->loadCount('comments'));
    }

    public function show(Discussion $discussion): DiscussionResource
    {
        $this->authorize('view', $discussion->project);

        return new DiscussionResource($discussion->load(['user', 'comments.user', 'comments.attachments.user'])->loadCount('comments'));
    }

    public function update(Request $request, Discussion $discussion): DiscussionResource
    {
        $this->authorizeOwnerOrEditor($request, $discussion->user_id, $discussion->project);

        $discussion->update($this->validateDiscussion($request));
        $discussion->project->logActivity('project_activity_updated_discussion', $discussion->subject);

        return new DiscussionResource($discussion->load('user')->loadCount('comments'));
    }

    public function destroy(Request $request, Discussion $discussion): JsonResponse
    {
        $this->authorizeOwnerOrEditor($request, $discussion->user_id, $discussion->project);

        $discussion->project->logActivity('project_activity_deleted_discussion', $discussion->subject);
        $discussion->comments()->with('attachments')->get()->each(fn ($comment) => $comment->attachments->each->delete());
        $discussion->delete();

        return response()->json(['message' => 'Discussion deleted.']);
    }

    public function storeComment(Request $request, Discussion $discussion): CommentResource
    {
        $project = $discussion->project;
        $this->authorize('view', $project);

        $data = $request->validate([
            'content' => ['nullable', 'string', 'max:65000', 'required_without:files'],
            'parent_id' => ['nullable', 'integer', 'exists:discussion_comments,id,discussion_id,'.$discussion->id],
            'files' => ['nullable', 'array', 'max:5'],
            'files.*' => ['file', 'max:20480'],
        ]);

        $comment = $discussion->comments()->create([
            'parent_id' => $data['parent_id'] ?? null,
            'user_id' => $request->user()->id,
            'content' => $data['content'] ?? null,
        ]);

        foreach ($request->file('files', []) as $file) {
            $comment->attachments()->create([
                'project_id' => $project->id,
                'user_id' => $request->user()->id,
                'disk_path' => $file->store('attachments/'.$request->user()->company_id.'/discussions/'.$discussion->id, 'local'),
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ]);
        }

        $discussion->update(['last_activity_at' => now()]);
        $project->logActivity('project_activity_commented_on_discussion', $discussion->subject);
        $this->notifier->notify($project->members()->pluck('user_id'), "commented on discussion {$discussion->subject}", $this->link($discussion));
        Emails::toStaff('new-project-discussion-comment-to-staff', (int) $project->company_id, $project->members()->pluck('user_id'), [
            ...Emails::project($project), ...$this->discussionFields($discussion),
            'discussion_comment' => preg_replace('/@\[([^\]]+)\]\(\d+\)/', '@$1', (string) $comment->content), 'discussion_creator' => $request->user()->full_name,
        ], $project);

        return new CommentResource($comment->load(['user', 'attachments.user']));
    }

    public function updateComment(Request $request, DiscussionComment $comment): CommentResource
    {
        abort_unless((int) $comment->user_id === (int) $request->user()->id, 403);
        $comment->update($request->validate(['content' => ['required', 'string', 'max:65000']]));

        return new CommentResource($comment->load(['user', 'attachments.user']));
    }

    public function destroyComment(Request $request, DiscussionComment $comment): JsonResponse
    {
        $this->authorizeOwnerOrEditor($request, $comment->user_id, $comment->discussion->project);

        $comment->discussion->project->logActivity('project_activity_deleted_discussion_comment', $comment->discussion->subject);
        $comment->attachments->each->delete();
        $comment->delete();

        return response()->json(['message' => 'Comment deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateDiscussion(Request $request): array
    {
        return $request->validate([
            'subject' => ['required', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:65000'],
        ]);
    }

    private function authorizeOwnerOrEditor(Request $request, int $ownerId, Project $project): void
    {
        abort_unless($ownerId === (int) $request->user()->id || $request->user()->can('update', $project), 403);
    }

    /**
     * @return array<string, string|null>
     */
    private function discussionFields(Discussion $discussion): array
    {
        return ['discussion_subject' => $discussion->subject, 'discussion_description' => $discussion->description, 'discussion_link' => Emails::url($this->link($discussion))];
    }

    private function link(Discussion $discussion): string
    {
        return "/projects/{$discussion->project_id}?tab=discussions&discussion={$discussion->id}";
    }
}
