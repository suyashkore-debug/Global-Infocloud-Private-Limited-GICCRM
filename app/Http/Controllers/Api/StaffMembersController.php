<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\HrmsSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Setup → Staff → Staff Members (admins): every account of the company. Accounts created here
 * (source "crm") live only in the CRM and are fully managed here; HRMS accounts are shown as they
 * are in HRMS and changed there.
 */
class StaffMembersController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $users = User::where('company_id', $company)->orderByDesc('is_active')->orderBy('full_name')->get();

        return response()->json(['data' => $users->map(fn (User $u) => $this->row($u))]);
    }

    public function store(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $data = $this->validated($request, null);

        $user = new User;
        $user->forceFill([
            ...$this->fields($data),
            'source' => User::SOURCE_CRM,
            'company_id' => $company,
            'password' => Hash::make($data['password']),
            'created_by' => $request->user()->id,
        ])->save();

        return response()->json(['message' => 'Staff member created.', 'data' => $this->row($user)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $company = $this->admin($request);
        $user = User::where('company_id', $company)->findOrFail($id);
        abort_unless($user->isCrmAccount(), 422, 'This account comes from HRMS: change it in HRMS.');
        abort_if($user->id === $request->user()->id && ! $request->boolean('is_active', true), 422, 'You cannot deactivate your own account.');
        $data = $this->validated($request, $user);

        $user->forceFill([
            ...$this->fields($data),
            ...(! empty($data['password']) ? ['password' => Hash::make($data['password']), 'failed_logins' => 0, 'locked_until' => null] : []),
        ])->save();
        // Deactivated or given a new password: sign out everywhere.
        if (! $user->is_active || ! empty($data['password'])) {
            $user->tokens()->delete();
        }

        return response()->json(['message' => 'Staff member updated.', 'data' => $this->row($user)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $company = $this->admin($request);
        $user = User::where('company_id', $company)->findOrFail($id);
        abort_unless($user->isCrmAccount(), 422, 'This account comes from HRMS: remove it in HRMS.');
        abort_if($user->id === $request->user()->id, 422, 'You cannot delete your own account.');

        $user->tokens()->delete();
        $user->forceFill(['is_active' => false])->save();
        $user->delete();

        return response()->json(['message' => 'Staff member deleted.']);
    }

    /** Copy HRMS users in now, rather than waiting for the scheduled sync. */
    public function sync(Request $request): JsonResponse
    {
        $this->admin($request);
        try {
            $counts = HrmsSync::all();
        } catch (Throwable) {
            return response()->json(['message' => 'HRMS is not reachable right now. The CRM keeps working with the last copy.'], 503);
        }

        return response()->json(['message' => "Synced {$counts['users']} HRMS users.", 'data' => $counts]);
    }

    private function admin(Request $request): int
    {
        abort_unless($request->user()->isAdmin(), 403);

        return (int) $request->user()->company_id;
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?User $user): array
    {
        $unique = fn (string $column) => Rule::unique('crm_users', $column)->ignore($user?->id)->whereNull('deleted_at');

        return $request->validate([
            'first_name' => ['required', 'string', 'max:50'],
            'last_name' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:150', $unique('email')],
            'username' => ['nullable', 'string', 'min:3', 'max:100', 'regex:/^[A-Za-z0-9._@-]+$/', $unique('username')],
            'mobile' => ['nullable', 'string', 'max:20', 'regex:/^[\d+ \-]*$/'],
            'employee_code' => ['nullable', 'string', 'max:50'],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8', 'max:100'],
            'is_company_admin' => ['boolean'],
            'is_active' => ['boolean'],
        ]);
    }

    /** @return array<string, mixed> */
    private function fields(array $data): array
    {
        return [
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'] ?? null,
            'full_name' => trim($data['first_name'].' '.($data['last_name'] ?? '')),
            'email' => strtolower($data['email']),
            'username' => ($data['username'] ?? null) ? strtolower($data['username']) : null,
            'mobile' => $data['mobile'] ?? null,
            'employee_code' => $data['employee_code'] ?? null,
            'is_company_admin' => (bool) ($data['is_company_admin'] ?? false),
            'is_active' => (bool) ($data['is_active'] ?? true),
        ];
    }

    /** @return array<string, mixed> */
    private function row(User $u): array
    {
        return [
            'id' => $u->id,
            'source' => $u->source,
            'first_name' => $u->first_name,
            'last_name' => $u->last_name,
            'full_name' => $u->full_name,
            'email' => $u->email,
            'username' => $u->username,
            'mobile' => $u->mobile,
            'employee_code' => $u->employee_code,
            'photo_url' => $u->photoUrl(),
            'is_company_admin' => (bool) $u->is_company_admin,
            'is_active' => (bool) $u->is_active,
            'locked' => (bool) $u->locked_until?->isFuture(),
            'last_login_at' => $u->last_login_at,
            'hrms_synced_at' => $u->hrms_synced_at,
        ];
    }
}
