<?php

namespace App\Http\Resources;

use App\Models\Proposal;
use App\Support\RichText;
use Illuminate\Http\Request;

/**
 * @mixin Proposal
 */
class ProposalResource extends SalesDocumentResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...$this->common($request),
            'subject' => $this->subject,
            'content' => $this->content,
            'content_html' => RichText::toHtml($this->content),
            'proposal_to' => $this->proposal_to,
            'address' => $this->address,
            'city' => $this->city,
            'state' => $this->state,
            'zip' => $this->zip,
            'country' => $this->country,
            'email' => $this->email,
            'phone' => $this->phone,
            'open_till' => $this->open_till?->toDateString(),
            'allow_comments' => $this->allow_comments,
            'converted_at' => $this->converted_at,
            'project' => $this->project_id ? ['id' => $this->project_id, 'name' => $this->project?->name] : null,
            'lead' => $this->whenLoaded('lead', fn () => $this->lead ? ['id' => $this->lead->id, 'name' => $this->lead->name] : null),
            'assigned' => $this->whenLoaded('assigned', fn () => $this->assigned ? new StaffResource($this->assigned) : null),
            'estimate' => $this->whenLoaded('estimate', fn () => $this->estimate ? ['id' => $this->estimate->id, 'formatted_number' => $this->estimate->formattedNumber()] : null),
            'invoice' => $this->whenLoaded('invoice', fn () => $this->invoice ? ['id' => $this->invoice->id, 'formatted_number' => $this->invoice->formattedNumber()] : null),
        ];
    }
}
