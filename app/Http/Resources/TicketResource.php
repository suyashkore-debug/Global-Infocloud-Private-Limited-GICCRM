<?php

namespace App\Http\Resources;

use App\Models\Ticket;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Ticket
 */
class TicketResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'message' => $this->message,
            'name' => $this->name,
            'email' => $this->email,
            'cc' => $this->cc,
            'requester' => $this->relationLoaded('contact') ? $this->requesterName() : $this->name,
            'last_reply_at' => $this->last_reply_at,
            'admin_read' => $this->admin_read,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->only(['id', 'name'])),
            'contact' => $this->whenLoaded('contact', fn () => $this->contact ? ['id' => $this->contact->id, 'name' => $this->contact->fullName(), 'email' => $this->contact->email] : null),
            'department' => $this->whenLoaded('department', fn () => $this->department?->only(['id', 'name'])),
            'priority' => $this->whenLoaded('priority', fn () => $this->priority?->only(['id', 'name'])),
            'status' => $this->whenLoaded('status', fn () => $this->status?->only(['id', 'name', 'color', 'system_key'])),
            'service' => $this->whenLoaded('service', fn () => $this->service?->only(['id', 'name'])),
            'project' => $this->whenLoaded('project', fn () => $this->project?->only(['id', 'name'])),
            'assigned' => $this->whenLoaded('assigned', fn () => $this->assigned ? new StaffResource($this->assigned) : null),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->pluck('name')),
            'replies' => $this->whenLoaded('replies', fn () => $this->replies->map(fn ($r) => [
                'id' => $r->id,
                'message' => $r->message,
                'is_staff' => (bool) $r->user_id,
                'author' => $r->user?->full_name ?? $r->contact?->fullName() ?? $r->name,
                'attachments' => AttachmentResource::collection($r->attachments),
                'created_at' => $r->created_at,
            ])),
            'notes' => $this->whenLoaded('notes', fn () => NoteResource::collection($this->notes)),
            'attachments' => $this->whenLoaded('attachments', fn () => AttachmentResource::collection($this->attachments)),
            'created_at' => $this->created_at,
            'can' => [
                'update' => $request->user()->can('update', $this->resource),
                'delete' => $request->user()->can('delete', $this->resource),
            ],
        ];
    }
}
