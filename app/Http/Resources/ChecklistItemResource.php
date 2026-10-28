<?php

namespace App\Http\Resources;

use App\Models\TaskChecklistItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin TaskChecklistItem
 */
class ChecklistItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'description' => $this->description,
            'finished' => $this->finished,
            'finished_by' => $this->whenLoaded('finisher', fn () => $this->finisher ? new StaffResource($this->finisher) : null),
            'assigned_to' => $this->whenLoaded('assignee', fn () => $this->assignee ? new StaffResource($this->assignee) : null),
            'list_order' => $this->list_order,
        ];
    }
}
