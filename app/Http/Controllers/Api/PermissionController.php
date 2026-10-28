<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffPermission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Settings → Staff permissions (admins only). Admins themselves always have every permission.
 */
class PermissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $granted = StaffPermission::get()->groupBy('user_id');

        $staff = User::where('company_id', $request->user()->company_id)
            ->where('is_active', true)
            ->orderBy('full_name')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'full_name' => $user->full_name,
                'email' => $user->email,
                'is_admin' => $user->isAdmin(),
                'permissions' => ($granted[$user->id] ?? collect())->map(fn ($p) => "{$p->feature}.{$p->capability}")->values(),
            ]);

        return response()->json(['data' => $staff, 'meta' => ['available' => StaffPermission::AVAILABLE]]);
    }

    public function update(Request $request, int $userId): JsonResponse
    {
        $this->authorizeAdmin($request);

        $allowed = collect(StaffPermission::AVAILABLE)->flatMap(fn ($caps, $feature) => collect($caps)->map(fn ($cap) => "{$feature}.{$cap}"))->all();
        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => [Rule::in($allowed)],
        ]);
        abort_unless(User::where('company_id', $request->user()->company_id)->whereKey($userId)->exists(), 404);

        StaffPermission::where('user_id', $userId)->delete();
        foreach (array_unique($data['permissions']) as $permission) {
            [$feature, $capability] = explode('.', $permission);
            StaffPermission::create(['user_id' => $userId, 'feature' => $feature, 'capability' => $capability]);
        }

        return response()->json(['message' => 'Permissions saved.']);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->isAdmin(), 403);
    }
}
