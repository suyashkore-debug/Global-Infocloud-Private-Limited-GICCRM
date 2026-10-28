<?php

namespace App\Http\Middleware;

use App\Models\Company;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A token stays valid in HRMS until it is revoked, so check on every request that the account
 * (and its company) is still allowed in: HR deactivating someone signs them out here at once.
 *
 * HRMS super admins belong to the platform company; with the X-Company-Id header they work
 * inside another company (like HRMS's "Login as"). The change is in memory only, never saved.
 */
class EnsureUserCanUseApp
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user?->canUseApp()) {
            return response()->json([
                'status' => false,
                'message' => 'Your account is not active. Please contact your administrator.',
            ], 401);
        }

        $companyId = (int) $request->header('X-Company-Id');
        if ($companyId && $user->is_super_admin && $companyId !== (int) $user->company_id && Company::whereKey($companyId)->exists()) {
            $user->setAttribute('acting_from_company_id', $user->company_id);
            $user->setAttribute('company_id', $companyId);
            $user->unsetRelation('company');
        }

        return $next($request);
    }
}
