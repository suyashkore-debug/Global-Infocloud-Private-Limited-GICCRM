<?php

namespace App\Http\Controllers\Api\Purchase;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Services\PurchasePdf;
use App\Services\PurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Perfex purchase → Purchase Orders: order from a vendor, approve, track delivery, bill it.
 */
class PurchaseOrderController extends Controller
{
    use PurchaseHelpers;

    public function __construct(private PurchaseService $purchases) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->hasPermission('purchase_orders', 'view') || $user->hasPermission('purchase_orders', 'view_own'), 403);
        $page = PurchaseOrder::query()
            ->when(! $user->hasPermission('purchase_orders', 'view'), fn ($q) => $q->where(fn ($w) => $w->where('created_by', $user->id)->orWhere('buyer_id', $user->id)
                ->orWhereHas('approvals', fn ($a) => $a->where('staff_id', $user->id))))
            ->when($request->integer('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->integer('vendor_id'), fn ($q, $v) => $q->where('vendor_id', $v))
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('code', 'like', "%{$s}%")->orWhere('name', 'like', "%{$s}%")))
            ->with(['vendor:id,name', 'currency'])->orderByDesc('id')->paginate(25);

        return response()->json([
            'data' => collect($page->items())->map(fn (PurchaseOrder $o) => [
                'id' => $o->id, 'code' => $o->code, 'name' => $o->name, 'vendor' => $o->vendor?->only(['id', 'name']),
                'order_date' => $o->order_date?->toDateString(), 'delivery_date' => $o->delivery_date?->toDateString(),
                'status' => $o->status, 'delivery_status' => $o->delivery_status, 'total' => (float) $o->total, 'total_tax' => (float) $o->total_tax,
                'currency' => $o->currency?->only(['symbol', 'placement']),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->allowView($request, $purchaseOrder);

        return response()->json(['data' => $this->detail($purchaseOrder, $request)]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('purchase_orders', 'create'), 403);
        $order = $this->purchases->createOrder($this->validated($request));

        return response()->json(['data' => $this->detail($order, $request)], 201);
    }

    public function update(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->allowEdit($request, $purchaseOrder);
        abort_unless(in_array($purchaseOrder->status, [PurchaseService::DRAFT, PurchaseService::REJECTED], true), 422, 'An approved or cancelled order cannot be edited.');
        $this->purchases->updateOrder($purchaseOrder, $this->validated($request));
        $purchaseOrder->update(['status' => PurchaseService::DRAFT]);
        $purchaseOrder->approvals()->delete();

        return response()->json(['data' => $this->detail($purchaseOrder->refresh(), $request)]);
    }

    public function destroy(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        abort_unless($request->user()->hasPermission('purchase_orders', 'delete'), 403);
        abort_if($purchaseOrder->invoices()->exists(), 422, 'This order already has invoices.');
        $purchaseOrder->items()->delete();
        $purchaseOrder->approvals()->delete();
        $purchaseOrder->delete();

        return response()->json(['message' => 'Purchase order deleted.']);
    }

    /**
     * send_approval | approve | reject | cancel | delivery | to_invoice
     */
    public function action(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'action' => ['required', Rule::in(['send_approval', 'approve', 'reject', 'cancel', 'delivery', 'to_invoice'])],
            'note' => ['nullable', 'string', 'max:2000'],
            'delivery_status' => ['required_if:action,delivery', 'nullable', Rule::in([0, 1, 2])],
        ]);

        switch ($data['action']) {
            case 'send_approval':
                $this->allowEdit($request, $purchaseOrder);
                $this->purchases->sendForApproval($purchaseOrder);
                break;
            case 'approve':
            case 'reject':
                $this->purchases->decide($purchaseOrder, $user, $data['action'] === 'approve', $data['note'] ?? null);
                break;
            case 'cancel':
                $this->allowEdit($request, $purchaseOrder);
                $purchaseOrder->update(['status' => PurchaseService::CANCELLED]);
                break;
            case 'delivery':
                $this->allowEdit($request, $purchaseOrder);
                $purchaseOrder->update(['delivery_status' => (int) $data['delivery_status']]);
                break;
            case 'to_invoice':
                abort_unless($user->hasPermission('purchase_invoices', 'create'), 403);
                $invoice = $this->purchases->invoiceFromOrder($purchaseOrder->load('items'));

                return response()->json(['data' => ['purchase_invoice_id' => $invoice->id]], 201);
        }

        return response()->json(['data' => $this->detail($purchaseOrder->refresh(), $request)]);
    }

    public function pdf(Request $request, PurchaseOrder $purchaseOrder): Response
    {
        $this->allowView($request, $purchaseOrder);

        return PurchasePdf::render($purchaseOrder, $request->boolean('inline'));
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;

        return $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'vendor_id' => ['required', 'integer', Rule::exists('vendors', 'id')->where('company_id', $company)],
            'purchase_request_id' => ['nullable', 'integer', Rule::exists('purchase_requests', 'id')->where('company_id', $company)],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('company_id', $company)],
            'currency_id' => ['nullable', 'integer', Rule::exists('currencies', 'id')->where('company_id', $company)],
            'buyer_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)],
            'order_date' => ['required', 'date'],
            'delivery_date' => ['nullable', 'date', 'after_or_equal:order_date'],
            'vendor_note' => ['nullable', 'string', 'max:10000'],
            'terms' => ['nullable', 'string', 'max:20000'],
            ...$this->moneyRules(),
            ...$this->lineRules($request),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(PurchaseOrder $o, Request $request): array
    {
        $o->load(['items', 'currency', 'vendor', 'project:id,name', 'request:id,code', 'invoices:id,invoice_number,purchase_order_id,total,payment_status']);
        $user = $request->user();

        return [
            ...collect($o->only(['id', 'code', 'name', 'status', 'delivery_status', 'vendor_note', 'terms', 'discount_type', 'purchase_request_id', 'project_id', 'currency_id', 'buyer_id', 'vendor_id']))->all(),
            'order_date' => $o->order_date?->toDateString(), 'delivery_date' => $o->delivery_date?->toDateString(),
            'vendor' => $o->vendor?->only(['id', 'name', 'vat', 'phone', 'address', 'city', 'state', 'zip', 'country']),
            'project' => $o->project, 'request' => $o->request, 'buyer' => $this->staffName($o->buyer_id),
            'currency' => $o->currency?->only(['id', 'symbol', 'placement', 'name']),
            'subtotal' => (float) $o->subtotal, 'discount_percent' => (float) $o->discount_percent, 'discount_total' => (float) $o->discount_total,
            'total_tax' => (float) $o->total_tax, 'shipping_fee' => (float) $o->shipping_fee, 'total' => (float) $o->total,
            'items' => $this->lines($o),
            'invoices' => $o->invoices,
            ...$this->approvalInfo($o, $user),
            'can' => [
                'edit' => $this->canEdit($request, $o) && in_array($o->status, [PurchaseService::DRAFT, PurchaseService::REJECTED], true),
                'manage' => $this->canEdit($request, $o),
                'delete' => $user->hasPermission('purchase_orders', 'delete'),
                'to_invoice' => $o->status === PurchaseService::APPROVED && $user->hasPermission('purchase_invoices', 'create'),
            ],
        ];
    }

    private function canEdit(Request $request, PurchaseOrder $o): bool
    {
        $user = $request->user();

        return $user->hasPermission('purchase_orders', 'edit') || ((int) $o->created_by === (int) $user->id && $user->hasPermission('purchase_orders', 'create'));
    }

    private function allowEdit(Request $request, PurchaseOrder $o): void
    {
        abort_unless($this->canEdit($request, $o), 403);
    }

    private function allowView(Request $request, PurchaseOrder $o): void
    {
        $u = $request->user();
        abort_unless($u->hasPermission('purchase_orders', 'view')
            || ($u->hasPermission('purchase_orders', 'view_own') && in_array((int) $u->id, [(int) $o->created_by, (int) $o->buyer_id], true))
            || $this->isApprover($o, $u), 403);
    }
}
