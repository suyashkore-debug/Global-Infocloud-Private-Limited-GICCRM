<?php

namespace App\Http\Resources;

use App\Models\Attachment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Attachment
 */
class AttachmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'original_name' => $this->original_name,
            'subject' => $this->subject,
            'description' => $this->description,
            'mime_type' => $this->mime_type,
            'size' => $this->size,
            'is_image' => $this->isImage(),
            'external_link' => $this->external_link,
            'download_url' => $this->disk_path ? "/api/files/{$this->id}/download" : null,
            'user' => $this->whenLoaded('user', fn () => $this->user ? new StaffResource($this->user) : null),
            'is_own' => (int) $this->user_id === (int) $request->user()->id,
            'created_at' => $this->created_at,
        ];
    }
}
