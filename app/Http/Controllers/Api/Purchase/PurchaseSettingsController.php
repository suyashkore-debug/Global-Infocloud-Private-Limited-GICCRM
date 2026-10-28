<?php

namespace App\Http\Controllers\Api\Purchase;

use App\Http\Controllers\Controller;
use App\Models\PurchaseApprovalSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Purchase settings (admins): approval settings per document type. Numbering, terms and the
 * default vendor note are company options (Setup → options).
 */
class PurchaseSettingsController extends Controller
{
    public function approvals(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(['data' => PurchaseApprovalSetting::orderBy('related')->get()]);
    }

    public function saveApproval(Request $request, ?PurchaseApprovalSetting $setting = null): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $company = $request->user()->company_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'related' => ['required', Rule::in(['pur_request', 'pur_order']), Rule::unique('purchase_approval_settings', 'related')->where('company_id', $company)->ignore($setting?->id)],
            'approver_ids' => ['required', 'array', 'min:1', 'max:20'],
            'approver_ids.*' => ['integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)],
        ]);
        $setting ? $setting->update($data) : $setting = PurchaseApprovalSetting::create($data);

        return response()->json(['data' => $setting], $setting->wasRecentlyCreated ? 201 : 200);
    }

    public function deleteApproval(Request $request, PurchaseApprovalSetting $setting): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $setting->delete();

        return response()->json(['message' => 'Approval setting deleted.']);
    }
}
