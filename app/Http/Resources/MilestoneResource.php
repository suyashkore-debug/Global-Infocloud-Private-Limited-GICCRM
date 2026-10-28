<?php

namespace App\Http\Resources;

use App\Enums\TaskStatus;
use App\Models\Milestone;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Milestone
 */
class MilestoneResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'start_date' => $this->start_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'color' => $this->color,
            'milestone_order' => $this->milestone_order,
            'tasks_total' => $this->whenLoaded('tasks', fn () => $this->tasks->count()),
            'tasks_finished' => $this->whenLoaded('tasks', fn () => $this->tasks->where('status', TaskStatus::Complete)->count()),
            'logged_seconds' => $this->whenLoaded('tasks', fn () => $this->tasks->sum(fn ($task) => $task->relationLoaded('timers') ? $task->totalLoggedSeconds() : 0)),
        ];
    }
}
