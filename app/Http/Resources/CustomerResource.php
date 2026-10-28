<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Customer
 */
class CustomerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'contact_name' => $this->contact_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'website' => $this->website,
            'vat' => $this->vat,
            'address' => $this->address,
            'city' => $this->city,
            'state' => $this->state,
            'zip' => $this->zip,
            'country' => $this->country,
            'company_pan' => $this->company_pan,
            'gst_type' => $this->gst_type,
            'default_currency_id' => $this->default_currency_id,
            'billing' => collect(['street', 'city', 'state', 'zip', 'country'])->mapWithKeys(fn ($f) => [$f => $this->{"billing_{$f}"}]),
            'shipping' => collect(['street', 'city', 'state', 'zip', 'country'])->mapWithKeys(fn ($f) => [$f => $this->{"shipping_{$f}"}]),
            'is_active' => $this->is_active,
            'primary_contact' => $this->whenLoaded('primaryContact', fn () => $this->primaryContact ? [
                'id' => $this->primaryContact->id,
                'name' => $this->primaryContact->fullName(),
                'email' => $this->primaryContact->email,
                'phone' => $this->primaryContact->phone,
            ] : null),
            'contacts' => $this->whenLoaded('contacts'),
            'groups' => $this->whenLoaded('groups', fn () => $this->groups->map->only(['id', 'name'])),
            'admins' => $this->whenLoaded('admins', fn () => $this->admins->map(fn ($a) => $a->user ? new StaffResource($a->user) : null)->filter()->values()),
            'projects_count' => $this->whenCounted('projects'),
            'created_at' => $this->created_at,
        ];
    }
}
