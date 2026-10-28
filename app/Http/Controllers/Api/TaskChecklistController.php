<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChecklistTemplate;
use App\Models\Task;
use App\Models\TaskChecklistItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskChecklistController extends Controller
{
    public function store(Request $request, Task $task): JsonResponse
    {
        $this->authorize('work', $task);
        $data = $request->validate([
            'description' => ['required', 'string', 'max:5000'],
            'save_as_template' => ['boolean'],
        ]);

        $item = $task->checklistItems()->create([
            'description' => $data['description'],
            'list_order' => (int) $task->checklistItems()->max('list_order') + 1,
            'created_by' => $request->user()->id,
        ]);

        if (! empty($data['save_as_template'])) {
            ChecklistTemplate::firstOrCreate(['description' => $data['description']]);
        }

        return response()->json(['data' => ['id' => $item->id]], 201);
    }

    public function update(Request $request, TaskChecklistItem $item): JsonResponse
    {
        $task = $item->task;
        $this->authorize('work', $task);

        $data = $request->validate([
            'description' => ['sometimes', 'string', 'max:5000'],
            'finished' => ['sometimes', 'boolean'],
            'assigned_to' => ['sometimes', 'nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)],
        ]);

        if (array_key_exists('finished', $data)) {
            $data['finished_by'] = $data['finished'] ? $request->user()->id : null;
        }

        $item->update($data);

        return response()->json(['message' => 'Checklist item updated.']);
    }

    public function destroy(TaskChecklistItem $item): JsonResponse
    {
        $this->authorize('work', $item->task);
        $item->delete();

        return response()->json(['message' => 'Checklist item deleted.']);
    }

    public function reorder(Request $request, Task $task): JsonResponse
    {
        $this->authorize('work', $task);
        $data = $request->validate(['order' => ['required', 'array'], 'order.*' => ['integer']]);

        foreach (array_values($data['order']) as $position => $id) {
            $task->checklistItems()->whereKey($id)->update(['list_order' => $position]);
        }

        return response()->json(['message' => 'Order saved.']);
    }

    public function templates(): JsonResponse
    {
        return response()->json(['data' => ChecklistTemplate::orderBy('description')->get(['id', 'description'])]);
    }

    public function destroyTemplate(Request $request, ChecklistTemplate $template): JsonResponse
    {
        abort_unless($request->user()->hasPermission('tasks', 'edit'), 403);
        $template->delete();

        return response()->json(['message' => 'Template deleted.']);
    }
}
