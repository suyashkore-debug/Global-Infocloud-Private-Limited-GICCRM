<?php

namespace App\Http\Resources;

use App\Models\DiscussionComment;
use App\Models\TaskComment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A task comment or a discussion comment.
 *
 * @mixin TaskComment|DiscussionComment
 */
class CommentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'parent_id' => $this->parent_id ?? null,
            'content' => $this->content,
            'user' => $this->whenLoaded('user', fn () => $this->user ? new StaffResource($this->user) : null),
            'contact' => $this->whenLoaded('contact', fn () => $this->contact ? ['id' => $this->contact->id, 'name' => $this->contact->fullName()] : null),
            'attachments' => $this->whenLoaded('attachments', fn () => AttachmentResource::collection($this->attachments)),
            'is_own' => $request->user() !== null && (int) $this->user_id === (int) $request->user()->id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
