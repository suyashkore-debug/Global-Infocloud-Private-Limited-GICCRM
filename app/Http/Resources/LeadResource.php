<?php

namespace App\Http\Resources;

use App\Models\Lead;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Lead
 */
class LeadResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'title' => $this->title,
            'company' => $this->company,
            'description' => $this->description,
            'email' => $this->email,
            'phone' => $this->phone,
            'website' => $this->website,
            'address' => $this->address,
            'city' => $this->city,
            'state' => $this->state,
            'zip' => $this->zip,
            'country' => $this->country,
            'default_language' => $this->default_language,
            'lead_value' => $this->lead_value,
            'qualification' => array_values(array_intersect(Lead::QUALIFICATION, (array) $this->qualification)),
            'rating' => $this->rating(),
            'is_public' => $this->is_public,
            'lost' => $this->lost,
            'junk' => $this->junk,
            'lead_order' => $this->lead_order,
            'last_contact_at' => $this->last_contact_at,
            'last_status_change_at' => $this->last_status_change_at,
            'assigned_at' => $this->assigned_at?->toDateString(),
            'converted_at' => $this->converted_at,
            'status' => $this->whenLoaded('status', fn () => $this->status?->only(['id', 'name', 'color', 'is_default'])),
            'web_form' => $this->whenLoaded('leadForm', fn () => $this->leadForm?->name),
            'source' => $this->whenLoaded('source', fn () => $this->source?->only(['id', 'name'])),
            'assigned' => $this->whenLoaded('assigned', fn () => $this->assigned ? new StaffResource($this->assigned) : null),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->only(['id', 'name'])),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->pluck('name')),
            'activities' => $this->whenLoaded('activities', fn () => $this->activities->map(fn ($a) => [
                'id' => $a->id,
                'description' => $a->description,
                'custom' => $a->custom,
                'user' => $a->user?->full_name,
                'created_at' => $a->created_at,
            ])),
            'notes' => $this->whenLoaded('notes', fn () => NoteResource::collection($this->notes)),
            'reminders' => $this->whenLoaded('reminders', fn () => ReminderResource::collection($this->reminders)),
            'attachments' => $this->whenLoaded('attachments', fn () => AttachmentResource::collection($this->attachments)),
            'proposals' => $this->whenLoaded('proposals', fn () => $this->proposals->map(fn ($p) => [
                'id' => $p->id,
                'formatted_number' => $p->formattedNumber(),
                'subject' => $p->subject,
                'total' => $p->total,
                'status' => $p->status->value,
            ])),
            // Kanban card and tab counts.
            'notes_count' => $this->whenCounted('notes'),
            'attachments_count' => $this->whenCounted('attachments'),
            'tasks_count' => $this->whenCounted('tasks'),
            'created_at' => $this->created_at,
            'can' => [
                'update' => $request->user()->can('update', $this->resource),
                'delete' => $request->user()->can('delete', $this->resource),
            ],
        ];
    }
}
