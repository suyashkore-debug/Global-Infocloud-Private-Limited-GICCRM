<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskReminder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * "Remind me" on a task: the reminder becomes a notification at the chosen time.
 */
class TaskReminderController extends Controller
{
    public function store(Request $request, Task $task): JsonResponse
    {
        $this->authorize('view', $task);
        $data = $request->validate([
            'remind_at' => ['required', 'date', 'after:now'],
            'description' => ['nullable', 'string', 'max:2000'],
            'user_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)],
            'notify_by_email' => ['boolean'],
        ]);

        $reminder = $task->reminders()->create([
            'user_id' => $data['user_id'] ?? $request->user()->id,
            'created_by' => $request->user()->id,
            'remind_at' => $data['remind_at'],
            'description' => $data['description'] ?? null,
            'notify_by_email' => (bool) ($data['notify_by_email'] ?? false),
        ]);

        return response()->json(['data' => ['id' => $reminder->id]], 201);
    }

    public function destroy(Request $request, TaskReminder $reminder): JsonResponse
    {
        abort_unless(in_array($request->user()->id, [(int) $reminder->user_id, (int) $reminder->created_by], true), 403);
        $reminder->delete();

        return response()->json(['message' => 'Reminder deleted.']);
    }
}
