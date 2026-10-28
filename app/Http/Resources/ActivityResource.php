<?php

namespace App\Http\Resources;

use App\Models\ProjectActivity;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ProjectActivity
 */
class ActivityResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'description_key' => $this->description_key,
            'additional_data' => $this->additional_data,
            'user' => $this->whenLoaded('user', fn () => $this->user ? new StaffResource($this->user) : null),
            'created_at' => $this->created_at,
        ];
    }
}
