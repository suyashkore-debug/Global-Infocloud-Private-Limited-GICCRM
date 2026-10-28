<?php

namespace App\Http\Resources;

use App\Models\Reminder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Reminder
 */
class ReminderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'remind_at' => $this->remind_at,
            'description' => $this->description,
            'is_notified' => $this->is_notified,
            'user' => $this->user?->full_name,
            'user_id' => $this->user_id,
            'created_at' => $this->created_at,
        ];
    }
}
