<?php

namespace App\Http\Resources;

use App\Models\Discussion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Discussion
 */
class DiscussionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'description' => $this->description,
            'user' => $this->whenLoaded('user', fn () => $this->user ? new StaffResource($this->user) : null),
            'comments_count' => $this->whenCounted('comments'),
            'comments' => $this->whenLoaded('comments', fn () => CommentResource::collection($this->comments)),
            'last_activity_at' => $this->last_activity_at,
            'is_own' => (int) $this->user_id === (int) $request->user()->id,
            'created_at' => $this->created_at,
        ];
    }
}
