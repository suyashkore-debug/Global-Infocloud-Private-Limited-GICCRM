<?php

namespace App\Http\Controllers\Api\Purchase;

use App\Http\Controllers\Controller;
use App\Models\PurchaseRequest;
use App\Services\PurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Perfex purchase → Purchase Requests: staff ask to buy something; approvers approve; an
 * approved request becomes a purchase order.
 */
class PurchaseRequestController extends Controller
{
    use PurchaseHelpers;

    public function __construct(private PurchaseService $purchases) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->allowList($request);
        $page = PurchaseRequest::query()
            ->when(! $user->hasPermission('purchase_requests', 'view'), fn ($q) => $q->where(fn ($w) => $w->where('requester_id', $user->id)->orWhere('created_by', $user->id)
                ->orWhereHas('approvals', fn ($a) => $a->where('staff_id', $user->id))))
            ->when($request->integer('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('code', 'like', "%{$s}%")->orWhere('name', 'like', "%{$s}%")))
            ->with('currency')->orderByDesc('id')->paginate(25);

        return response()->json([
            'data' => collect($page->items())->map(fn (PurchaseRequest $r) => [
                'id' => $r->id, 'code' => $r->code, 'name' => $r->name, 'requester' => $this->staffName($r->requester_id), 'department' => $r->department,
                'request_date' => $r->request_date?->toIso8601String(), 'status' => $r->status, 'total' => (float) $r->total,
                'currency' => $r->currency?->only(['symbol', 'placement']),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->allowView($request, $purchaseRequest);

        return response()->json(['data' => $this->detail($purchaseRequest, $request)]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('purchase_requests', 'create'), 403);
        $created = $this->purchases->createRequest($this->validated($request));

        return response()->json(['data' => $this->detail($created, $request)], 201);
    }

    public function update(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->allowEdit($request, $purchaseRequest);
        abort_unless(in_array($purchaseRequest->status, [PurchaseService::DRAFT, PurchaseService::REJECTED], true), 422, 'An approved or cancelled request cannot be edited.');
        $this->purchases->updateRequest($purchaseRequest, $this->validated($request));
        $purchaseRequest->update(['status' => PurchaseService::DRAFT]);
        $purchaseRequest->approvals()->delete();

        return response()->json(['data' => $this->detail($purchaseRequest->refresh(), $request)]);
    }

    public function destroy(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        abort_unless($request->user()->hasPermission('purchase_requests', 'delete'), 403);
        abort_if($purchaseRequest->orders()->exists(), 422, 'This request already has purchase orders.');
        $purchaseRequest->items()->delete();
        $purchaseRequest->approvals()->delete();
        $purchaseRequest->delete();

        return response()->json(['message' => 'Purchase request deleted.']);
    }

    /**
     * send_approval | approve | reject | cancel | to_order
     */
    public function action(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'action' => ['required', Rule::in(['send_approval', 'approve', 'reject', 'cancel', 'to_order'])],
            'note' => ['nullable', 'string', 'max:2000'],
            'vendor_id' => ['required_if:action,to_order', 'nullable', 'integer', Rule::exists('vendors', 'id')->where('company_id', $user->company_id)],
        ]);

        switch ($data['action']) {
            case 'send_approval':
                $this->allowEdit($request, $purchaseRequest);
                $this->purchases->sendForApproval($purchaseRequest);
                break;
            case 'approve':
            case 'reject':
                $this->purchases->decide($purchaseRequest, $user, $data['action'] === 'approve', $data['note'] ?? null);
                break;
            case 'cancel':
                $this->allowEdit($request, $purchaseRequest);
                $purchaseRequest->update(['status' => PurchaseService::CANCELLED]);
                break;
            case 'to_order':
                abort_unless($user->hasPermission('purchase_orders', 'create'), 403);
                $order = $this->purchases->orderFromRequest($purchaseRequest->load('items'), (int) $data['vendor_id']);

                return response()->json(['data' => ['purchase_order_id' => $order->id]], 201);
        }

        return response()->json(['data' => $this->detail($purchaseRequest->refresh(), $request)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;

        return $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'description' => ['nullable', 'string', 'max:10000'],
            'department' => ['nullable', 'string', 'max:191'],
            'requester_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)],
            'request_date' => ['nullable', 'date'],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('company_id', $company)],
            'currency_id' => ['nullable', 'integer', Rule::exists('currencies', 'id')->where('company_id', $company)],
            ...$this->lineRules($request),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(PurchaseRequest $r, Request $request): array
    {
        $r->load(['items', 'currency', 'project:id,name', 'orders:id,code,purchase_request_id']);
        $user = $request->user();

        return [
            'id' => $r->id, 'code' => $r->code, 'name' => $r->name, 'description' => $r->description, 'department' => $r->department,
            'requester' => ['id' => $r->requester_id, 'name' => $this->staffName($r->requester_id)],
            'request_date' => $r->request_date?->toIso8601String(), 'status' => $r->status,
            'project' => $r->project, 'currency' => $r->currency?->only(['id', 'symbol', 'placement', 'name']),
            'subtotal' => (float) $r->subtotal, 'total_tax' => (float) $r->total_tax, 'total' => (float) $r->total,
            'items' => $this->lines($r),
            'orders' => $r->orders->map(fn ($o) => ['id' => $o->id, 'code' => $o->code]),
            ...$this->approvalInfo($r, $user),
            'can' => [
                'edit' => $this->canEdit($request, $r) && in_array($r->status, [PurchaseService::DRAFT, PurchaseService::REJECTED], true),
                'delete' => $user->hasPermission('purchase_requests', 'delete'),
                'to_order' => $r->status === PurchaseService::APPROVED && $user->hasPermission('purchase_orders', 'create'),
            ],
        ];
    }

    private function canEdit(Request $request, PurchaseRequest $r): bool
    {
        $user = $request->user();

        return $user->hasPermission('purchase_requests', 'edit') || ((int) $r->created_by === (int) $user->id && $user->hasPermission('purchase_requests', 'create'));
    }

    private function allowEdit(Request $request, PurchaseRequest $r): void
    {
        abort_unless($this->canEdit($request, $r), 403);
    }

    private function allowList(Request $request): void
    {
        $u = $request->user();
        abort_unless($u->hasPermission('purchase_requests', 'view') || $u->hasPermission('purchase_requests', 'view_own') || $u->hasPermission('purchase_requests', 'create'), 403);
    }

    private function allowView(Request $request, PurchaseRequest $r): void
    {
        $u = $request->user();
        abort_unless($u->hasPermission('purchase_requests', 'view') || in_array((int) $u->id, [(int) $r->requester_id, (int) $r->created_by], true) || $this->isApprover($r, $u), 403);
    }
}
