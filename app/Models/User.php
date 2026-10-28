<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * An HRMS (GICSupportCRMLaravel) user. Accounts are created and managed in HRMS only;
 * this app reads them through the read-only "hrms" connection.
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, SoftDeletes;

    protected $connection = 'hrms';

    protected $table = 'users';

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'login_otp',
        'forgot_otp',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_company_admin' => 'boolean',
            'is_super_admin' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Company, $this>
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles');
    }

    /**
     * Permissions granted in this app (Settings → Staff permissions).
     *
     * @return HasMany<StaffPermission, $this>
     */
    public function staffPermissions(): HasMany
    {
        return $this->hasMany(StaffPermission::class);
    }

    /**
     * Company admins and super admins act as Perfex admins: every permission.
     */
    /**
     * The HRMS profile photo, when this row was loaded with profile_photo.
     */
    public function photoUrl(): ?string
    {
        $path = $this->getAttributes()['profile_photo'] ?? null;
        if (! $path) {
            return null;
        }
        // Same rules as HRMS: a full link is used as is; "public/x" lives at /storage/x.
        if (str_starts_with($path, 'http')) {
            return $path;
        }

        return rtrim(config('services.hrms.storage_url'), '/').'/'.ltrim(preg_replace('#^/?(storage/|public/)#', '', $path), '/');
    }

    public function isAdmin(): bool
    {
        return $this->is_company_admin || $this->is_super_admin;
    }

    public function hasPermission(string $feature, string $capability): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return $this->staffPermissions
            ->contains(fn (StaffPermission $permission) => $permission->feature === $feature && $permission->capability === $capability);
    }

    /**
     * Same gate HRMS applies at login: an inactive account, or an account of a company that is
     * not active, may not use the app. Super admins skip the company check, as they do in HRMS.
     */
    public function canUseApp(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        if ($this->is_super_admin) {
            return true;
        }

        return $this->company?->status === 'active';
    }
}
