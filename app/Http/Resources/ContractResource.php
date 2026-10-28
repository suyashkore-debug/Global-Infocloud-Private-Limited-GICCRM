<?php

namespace App\Http\Resources;

use App\Models\Contract;
use App\Support\RichText;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Contract
 */
class ContractResource extends JsonResource
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
            'content' => $this->content,
            'content_html' => RichText::toHtml($this->content),
            'start_date' => $this->start_date->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'contract_value' => $this->contract_value,
            'trash' => $this->trash,
            'not_visible_to_client' => $this->not_visible_to_client,
            'signed' => $this->signed,
            'marked_as_signed' => $this->marked_as_signed,
            'signer_name' => $this->signer_name,
            'signed_at' => $this->signed_at,
            'is_expired' => $this->isExpired(),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->only(['id', 'name'])),
            'type' => $this->whenLoaded('type', fn () => $this->type?->only(['id', 'name'])),
            'project' => $this->whenLoaded('project', fn () => $this->project?->only(['id', 'name'])),
            'renewals' => $this->whenLoaded('renewals', fn () => $this->renewals->map(fn ($r) => [
                'id' => $r->id,
                'old_start_date' => $r->old_start_date->toDateString(),
                'new_start_date' => $r->new_start_date->toDateString(),
                'old_end_date' => $r->old_end_date?->toDateString(),
                'new_end_date' => $r->new_end_date?->toDateString(),
                'old_value' => $r->old_value,
                'new_value' => $r->new_value,
                'renewed_by' => $r->renewer?->full_name,
                'created_at' => $r->created_at,
            ])),
            'comments' => $this->whenLoaded('comments', fn () => CommentResource::collection($this->comments)),
            'attachments' => $this->whenLoaded('attachments', fn () => AttachmentResource::collection($this->attachments)),
            'created_at' => $this->created_at,
            'can' => [
                'update' => (bool) $request->user()?->can('update', $this->resource),
                'delete' => (bool) $request->user()?->can('delete', $this->resource),
            ],
        ];
    }
}
