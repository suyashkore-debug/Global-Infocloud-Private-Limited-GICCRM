<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommentResource;
use App\Models\Task;
use App\Models\TaskComment;
use App\Services\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskCommentController extends Controller
{
    public function __construct(private TaskService $tasks) {}

    public function store(Request $request, Task $task): CommentResource
    {
        $this->authorize('comment', $task);
        $data = $request->validate(['content' => ['required', 'string', 'max:65000']]);

        return new CommentResource($this->tasks->addComment($task, $data['content'])->load('user'));
    }

    public function update(Request $request, TaskComment $comment): CommentResource
    {
        $this->authorizeOwnerOrEditor($request, $comment);
        $comment->update($request->validate(['content' => ['required', 'string', 'max:65000']]));

        return new CommentResource($comment->load('user'));
    }

    public function destroy(Request $request, TaskComment $comment): JsonResponse
    {
        $this->authorizeOwnerOrEditor($request, $comment);
        $comment->delete();

        return response()->json(['message' => 'Comment deleted.']);
    }

    /**
     * Perfex: the author, or staff who may edit the task, may change a comment.
     */
    private function authorizeOwnerOrEditor(Request $request, TaskComment $comment): void
    {
        abort_unless(
            (int) $comment->user_id === (int) $request->user()->id || $request->user()->can('update', $comment->task),
            403,
        );
    }
}
