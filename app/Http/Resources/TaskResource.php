<?php

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A task for lists and the board; the detail fields come with ?detail (TaskController@show).
 *
 * @mixin Task
 */
class TaskResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status->value,
            'priority' => $this->priority->value,
            'start_date' => $this->start_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'date_finished' => $this->date_finished,
            'is_public' => $this->is_public,
            'visible_to_client' => (bool) $this->visible_to_client,
            'billable' => $this->billable,
            'invoice_id' => $this->invoice_id,
            'hourly_rate' => $this->hourly_rate,
            'kanban_order' => $this->kanban_order,
            'milestone_order' => $this->milestone_order,
            'repeat_every' => $this->repeat_every,
            'recurring_type' => $this->recurring_type,
            'cycles' => $this->cycles,
            'total_cycles' => $this->total_cycles,
            'lead' => $this->whenLoaded('lead', fn () => $this->lead?->only(['id', 'name'])),
            'project' => $this->whenLoaded('project', fn () => $this->project ? [
                'id' => $this->project->id,
                'name' => $this->project->name,
                'customer_name' => $this->project->relationLoaded('customer') ? $this->project->customer?->name : null,
            ] : null),
            'milestone' => $this->whenLoaded('milestone', fn () => $this->milestone ? ['id' => $this->milestone->id, 'name' => $this->milestone->name, 'color' => $this->milestone->color] : null),
            'assignees' => $this->whenLoaded('assignees', fn () => $this->assignees->map(fn ($a) => $a->user ? new StaffResource($a->user) : null)->filter()->values()),
            'followers' => $this->whenLoaded('followers', fn () => $this->followers->map(fn ($f) => $f->user ? new StaffResource($f->user) : null)->filter()->values()),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->pluck('name')),
            'checklist_total' => $this->whenCounted('checklistItems'),
            'checklist_finished' => $this->whenCounted('finishedChecklistItems'),
            'comments_count' => $this->whenCounted('comments'),
            'attachments_count' => $this->whenCounted('attachments'),
            'total_logged_seconds' => $this->whenLoaded('timers', fn () => $this->totalLoggedSeconds()),
            'my_running_timer_id' => $this->whenLoaded('timers', fn () => $this->timers->first(fn ($t) => $t->end_time === null && (int) $t->user_id === (int) $user->id)?->id),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator ? new StaffResource($this->creator) : null),
            'created_at' => $this->created_at,
            'can' => $this->when($this->relationLoaded('assignees'), fn () => [
                'update' => $user->can('update', $this->resource),
                'delete' => $user->can('delete', $this->resource),
                'work' => $user->can('work', $this->resource),
                'track_time' => $user->can('trackTime', $this->resource),
            ]),
        ];
    }
}
