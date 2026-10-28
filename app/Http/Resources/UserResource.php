<?php

namespace App\Http\Resources;

use App\Models\StaffPermission;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'employee_code' => $this->employee_code,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'mobile' => $this->mobile,
            'photo_url' => $this->resource->photoUrl(),
            'is_company_admin' => $this->is_company_admin,
            'is_super_admin' => $this->is_super_admin,
            'is_admin' => $this->isAdmin(),
            'is_super_admin_acting' => (bool) $this->resource->getAttribute('acting_from_company_id'),
            'permissions' => $this->isAdmin()
                ? collect(StaffPermission::AVAILABLE)->flatMap(fn ($caps, $feature) => collect($caps)->map(fn ($cap) => "{$feature}.{$cap}"))->values()
                : $this->staffPermissions->map(fn ($p) => "{$p->feature}.{$p->capability}")->values(),
            'company' => $this->whenLoaded('company', fn () => $this->company ? [
                'id' => $this->company->id,
                'company_name' => $this->company->company_name,
                'logo_url' => $this->company->logoUrl(),
                'portal_slug' => $this->company->portalSlug(),
            ] : null),
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->map(fn ($role) => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
            ])->values()),
        ];
    }
}
