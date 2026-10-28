<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A short HRMS user (for member lists, assignees, authors).
 *
 * @mixin User
 */
class StaffResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'full_name' => $this->full_name ?: trim($this->first_name.' '.$this->last_name),
            'email' => $this->email,
            'employee_code' => $this->employee_code,
            'photo_url' => $this->resource->photoUrl(),
        ];
    }
}
