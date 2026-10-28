<?php

namespace App\Http\Resources;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Project
 */
class ProjectResource extends JsonResource
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
            'workspace_link' => $this->workspace_link,
            'status' => $this->status->value,
            'billing_type' => $this->billing_type->value,
            'project_cost' => $this->project_cost,
            'project_rate_per_hour' => $this->project_rate_per_hour,
            'estimated_hours' => $this->estimated_hours,
            'customer_settings' => $this->resource->customerSettings(),
            'start_date' => $this->start_date?->toDateString(),
            'deadline' => $this->deadline?->toDateString(),
            'date_finished' => $this->date_finished,
            'progress' => $this->progress,
            'progress_from_tasks' => $this->progress_from_tasks,
            'calculated_progress' => $this->calculatedProgress(),
            'customer' => $this->whenLoaded('customer', fn () => ['id' => $this->customer->id, 'name' => $this->customer->name]),
            'members' => $this->whenLoaded('members', fn () => $this->members->map(fn ($member) => $member->user ? new StaffResource($member->user) : null)->filter()->values()),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->pluck('name')),
            'is_pinned' => $this->whenLoaded('pins', fn () => $this->pins->contains('user_id', $request->user()->id)),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator ? new StaffResource($this->creator) : null),
            'created_at' => $this->created_at,
            'can' => [
                'update' => $request->user()->can('update', $this->resource),
                'delete' => $request->user()->can('delete', $this->resource),
                'contribute' => $request->user()->can('contribute', $this->resource),
                'create_tasks' => $request->user()->can('create', [Task::class, $this->resource]),
            ],
        ];
    }
}
