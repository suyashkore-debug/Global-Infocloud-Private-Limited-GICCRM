<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Services\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Task assignees and followers.
 */
class TaskPeopleController extends Controller
{
    public function __construct(private TaskService $tasks) {}

    public function addAssignee(Request $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);
        $this->tasks->addAssignee($task, $this->validatedUserId($request));

        return response()->json(['message' => 'Assignee added.']);
    }

    public function removeAssignee(Task $task, int $userId): JsonResponse
    {
        $this->authorize('update', $task);
        $this->tasks->removeAssignee($task, $userId);

        return response()->json(['message' => 'Assignee removed.']);
    }

    public function addFollower(Request $request, Task $task): JsonResponse
    {
        $userId = $this->validatedUserId($request);
        // Anyone who can see a task may follow it themselves; adding others needs edit rights.
        $this->authorize($userId === $request->user()->id ? 'view' : 'update', $task);
        $this->tasks->addFollower($task, $userId);

        return response()->json(['message' => 'Follower added.']);
    }

    public function removeFollower(Request $request, Task $task, int $userId): JsonResponse
    {
        $this->authorize($userId === $request->user()->id ? 'view' : 'update', $task);
        $this->tasks->removeFollower($task, $userId);

        return response()->json(['message' => 'Follower removed.']);
    }

    private function validatedUserId(Request $request): int
    {
        return (int) $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('hrms.users', 'id')
                ->where('company_id', $request->user()->company_id)
                ->where('is_active', true)
                ->whereNull('deleted_at')],
        ])['user_id'];
    }
}
