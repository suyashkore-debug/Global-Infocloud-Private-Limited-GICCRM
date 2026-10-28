<?php

namespace App\Http\Resources;

use App\Models\AppNotification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin AppNotification
 */
class NotificationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'description' => $this->description,
            'link' => $this->link,
            'from_user' => $this->whenLoaded('fromUser', fn () => $this->fromUser ? new StaffResource($this->fromUser) : null),
            'read_at' => $this->read_at,
            'created_at' => $this->created_at,
        ];
    }
}
