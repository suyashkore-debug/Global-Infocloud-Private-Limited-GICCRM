<?php

namespace App\Http\Resources;

use App\Models\Note;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Note
 */
class NoteResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'description' => $this->description,
            'contacted_at' => $this->contacted_at,
            'author' => $this->creator?->full_name,
            'is_own' => (int) $this->created_by === (int) $request->user()->id,
            'created_at' => $this->created_at,
        ];
    }
}
