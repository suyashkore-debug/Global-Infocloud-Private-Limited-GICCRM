<?php

namespace App\Http\Resources;

use App\Models\TaskTimer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin TaskTimer
 */
class TimerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'start_time' => $this->start_time,
            'end_time' => $this->end_time,
            'duration_seconds' => $this->durationSeconds(),
            'is_running' => $this->isRunning(),
            'hourly_rate' => $this->hourly_rate,
            'note' => $this->note,
            'user' => $this->whenLoaded('user', fn () => $this->user ? new StaffResource($this->user) : null),
            'task' => $this->whenLoaded('task', fn () => $this->task === null ? null : [
                'id' => $this->task->id,
                'name' => $this->task->name,
                'project_id' => $this->task->project_id,
                'project_name' => $this->task->relationLoaded('project') ? $this->task->project?->name : null,
            ]),
            'is_own' => (int) $this->user_id === (int) $request->user()->id,
        ];
    }
}
