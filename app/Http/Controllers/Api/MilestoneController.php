<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\MilestoneRequest;
use App\Http\Resources\MilestoneResource;
use App\Models\Milestone;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Project milestones. As in Perfex, creating and changing them needs project edit rights.
 */
class MilestoneController extends Controller
{
    public function index(Project $project): AnonymousResourceCollection
    {
        $this->authorize('view', $project);

        return MilestoneResource::collection($project->milestones()->with('tasks.timers')->get());
    }

    public function store(MilestoneRequest $request, Project $project): MilestoneResource
    {
        $this->authorize('update', $project);

        $milestone = $project->milestones()->create([
            ...$request->validated(),
            'milestone_order' => $request->validated('milestone_order') ?? ((int) $project->milestones()->max('milestone_order') + 1),
        ]);
        $project->logActivity('project_activity_created_milestone', $milestone->name);

        return new MilestoneResource($milestone);
    }

    public function update(MilestoneRequest $request, Milestone $milestone): MilestoneResource
    {
        $this->authorize('update', $milestone->project);

        $milestone->update($request->validated());
        $milestone->project->logActivity('project_activity_updated_milestone', $milestone->name);

        return new MilestoneResource($milestone);
    }

    public function destroy(Milestone $milestone): JsonResponse
    {
        $this->authorize('update', $milestone->project);

        $milestone->project->logActivity('project_activity_deleted_milestone', $milestone->name);
        $milestone->delete();

        return response()->json(['message' => 'Milestone deleted.']);
    }

    /**
     * Milestones board: the order of the columns, and the tasks moved inside / between them.
     */
    public function reorder(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);
        $data = $request->validate([
            'milestones' => ['sometimes', 'array'],
            'milestones.*' => ['integer'],
            'tasks' => ['sometimes', 'array'],
            'tasks.*.milestone_id' => ['nullable', 'integer'],
            'tasks.*.order' => ['array'],
            'tasks.*.order.*' => ['integer'],
        ]);

        foreach (array_values($data['milestones'] ?? []) as $position => $id) {
            $project->milestones()->whereKey($id)->update(['milestone_order' => $position + 1]);
        }

        $milestoneIds = $project->milestones()->pluck('id');
        foreach ($data['tasks'] ?? [] as $column) {
            $milestoneId = $column['milestone_id'] ?? null;
            if ($milestoneId && ! $milestoneIds->contains($milestoneId)) {
                continue;
            }
            foreach (array_values($column['order'] ?? []) as $position => $taskId) {
                $project->tasks()->whereKey($taskId)->update(['milestone_id' => $milestoneId, 'milestone_order' => $position + 1]);
            }
        }

        return response()->json(['message' => 'Order saved.']);
    }
}
