<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Hrms\HrmsCompany;
use App\Models\Hrms\HrmsRole;
use App\Models\Hrms\HrmsUser;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Copies HRMS companies, roles and users into the CRM's own tables (same ids), so HRMS users can
 * work in the CRM, and log in while HRMS is down, with what HRMS last said. HRMS stays the owner of
 * these rows: an HRMS user deactivated or deleted there is deactivated here. Accounts created in
 * the CRM (source "crm") are never touched.
 */
class HrmsSync
{
    /**
     * Everything at once (the scheduler, and after install).
     *
     * @return array{companies: int, users: int, roles: int, deactivated: int}
     */
    public static function all(): array
    {
        $companies = HrmsCompany::query()->get();
        foreach ($companies as $company) {
            self::saveCompany($company);
        }
        $roles = HrmsRole::query()->get();
        foreach ($roles as $role) {
            self::saveRole($role);
        }
        $users = HrmsUser::query()->get();
        foreach ($users as $user) {
            self::saveUser($user);
        }
        self::saveUserRoles($users->pluck('id')->all());

        // HRMS accounts that are gone from HRMS may not log in any more.
        $deactivated = User::where('source', User::SOURCE_HRMS)->whereNotIn('id', $users->pluck('id'))->where('is_active', true)->update(['is_active' => false]);

        return ['companies' => $companies->count(), 'users' => $users->count(), 'roles' => $roles->count(), 'deactivated' => $deactivated];
    }

    /**
     * One HRMS user (at their HRMS login), with their company and roles. Null when HRMS has no
     * such user.
     */
    public static function user(int $hrmsId): ?User
    {
        $hrms = HrmsUser::query()->find($hrmsId);
        if (! $hrms) {
            return null;
        }
        if ($hrms->company_id && ($company = HrmsCompany::query()->find($hrms->company_id))) {
            self::saveCompany($company);
        }
        HrmsRole::query()->where('company_id', $hrms->company_id)->orWhereNull('company_id')->get()->each(fn ($r) => self::saveRole($r));
        $user = self::saveUser($hrms);
        self::saveUserRoles([$hrmsId]);

        return $user;
    }

    private static function saveCompany(HrmsCompany $hrms): void
    {
        $company = Company::withTrashed()->find($hrms->id) ?? new Company;
        $company->forceFill([
            'id' => $hrms->id,
            'company_name' => (string) $hrms->company_name,
            'public_careers_slug' => $hrms->public_careers_slug ?? null,
            'short_code' => $hrms->short_code ?? null,
            'logo' => $hrms->logo ?? null,
            'status' => $hrms->status ?? 'active',
            'deleted_at' => $hrms->deleted_at ?? null,
            'hrms_synced_at' => now(),
        ])->save();
    }

    private static function saveRole(HrmsRole $hrms): void
    {
        $role = Role::withTrashed()->find($hrms->id) ?? new Role;
        $role->forceFill([
            'id' => $hrms->id,
            'company_id' => $hrms->company_id,
            'name' => (string) $hrms->name,
            'slug' => $hrms->slug ?? null,
            'deleted_at' => $hrms->deleted_at ?? null,
        ])->save();
    }

    private static function saveUser(HrmsUser $hrms): User
    {
        $user = User::withTrashed()->find($hrms->id);
        if ($user && $user->isCrmAccount()) {
            // Cannot happen (CRM ids start at 1000001), but never overwrite a CRM account.
            return $user;
        }
        $user ??= new User;
        $user->forceFill([
            'id' => $hrms->id,
            'source' => User::SOURCE_HRMS,
            'company_id' => $hrms->company_id,
            'employee_code' => $hrms->employee_code ?? null,
            'first_name' => $hrms->first_name ?? null,
            'last_name' => $hrms->last_name ?? null,
            'full_name' => $hrms->full_name ?? trim(($hrms->first_name ?? '').' '.($hrms->last_name ?? '')),
            'email' => $hrms->email ?? null,
            'mobile' => $hrms->mobile ?? null,
            'profile_photo' => $hrms->profile_photo ?? null,
            'password' => $hrms->password ?? null,
            'is_company_admin' => (bool) ($hrms->is_company_admin ?? false),
            'is_super_admin' => (bool) ($hrms->is_super_admin ?? false),
            'is_active' => (bool) ($hrms->is_active ?? true) && empty($hrms->deleted_at),
            'deleted_at' => $hrms->deleted_at ?? null,
            'hrms_synced_at' => now(),
        ])->save();

        return $user;
    }

    /** @param  array<int, int>  $userIds */
    private static function saveUserRoles(array $userIds): void
    {
        if (! $userIds) {
            return;
        }
        $links = DB::connection('hrms')->table('user_roles')->whereIn('user_id', $userIds)->get(['user_id', 'role_id']);
        DB::table('crm_user_roles')->whereIn('user_id', $userIds)->delete();
        $known = Role::withTrashed()->pluck('id')->flip();
        DB::table('crm_user_roles')->insert($links->filter(fn ($l) => isset($known[$l->role_id]))
            ->map(fn ($l) => ['user_id' => $l->user_id, 'role_id' => $l->role_id])->unique(fn ($l) => $l['user_id'].'-'.$l['role_id'])->values()->all());
    }
}
