<?php

namespace App\Http\Controllers\Api\Purchase;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoicePayment;
use App\Services\PurchasePdf;
use App\Services\PurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Perfex purchase → Invoices (vendor bills): enter the bill, attach the scan, record payments.
 */
class PurchaseInvoiceController extends Controller
{
    use PurchaseHelpers;

    public function __construct(private PurchaseService $purchases) {}

    public function index(Request $request): JsonResponse
    {
        $this->allow($request, 'view');
        $query = PurchaseInvoice::query()
            ->when($request->string('payment_status')->value(), fn ($q, $s) => $q->where('payment_status', $s))
            ->when($request->integer('vendor_id'), fn ($q, $v) => $q->where('vendor_id', $v))
            ->when($request->date('from'), fn ($q, $d) => $q->whereDate('invoice_date', '>=', $d))
            ->when($request->date('to'), fn ($q, $d) => $q->whereDate('invoice_date', '<=', $d))
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('invoice_number', 'like', "%{$s}%")->orWhere('vendor_invoice_number', 'like', "%{$s}%")
                ->orWhereHas('vendor', fn ($v) => $v->where('name', 'like', "%{$s}%"))));
        $summary = (clone $query)->withSum('payments', 'amount')->get(['id', 'total']);
        $page = $query->with(['vendor:id,name', 'currency', 'order:id,code'])->withSum('payments', 'amount')->orderByDesc('invoice_date')->orderByDesc('id')->paginate(25);

        return response()->json([
            'data' => collect($page->items())->map(fn (PurchaseInvoice $i) => [
                'id' => $i->id, 'invoice_number' => $i->invoice_number, 'vendor_invoice_number' => $i->vendor_invoice_number,
                'vendor' => $i->vendor?->only(['id', 'name']), 'order' => $i->order?->only(['id', 'code']),
                'invoice_date' => $i->invoice_date?->toDateString(), 'due_date' => $i->due_date?->toDateString(),
                'total_tax' => (float) $i->total_tax, 'total' => (float) $i->total, 'paid' => round((float) $i->payments_sum_amount, 2),
                'payment_status' => $i->payment_status, 'currency' => $i->currency?->only(['symbol', 'placement']),
            ]),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
                'summary' => ['total' => round((float) $summary->sum('total'), 2), 'paid' => round((float) $summary->sum('payments_sum_amount'), 2)],
            ],
        ]);
    }

    public function show(Request $request, PurchaseInvoice $purchaseInvoice): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => $this->detail($purchaseInvoice, $request)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $invoice = $this->purchases->createInvoice($this->validated($request));

        return response()->json(['data' => $this->detail($invoice, $request)], 201);
    }

    public function update(Request $request, PurchaseInvoice $purchaseInvoice): JsonResponse
    {
        $this->allow($request, 'edit');
        $this->purchases->updateInvoice($purchaseInvoice, $this->validated($request));

        return response()->json(['data' => $this->detail($purchaseInvoice->refresh(), $request)]);
    }

    public function destroy(Request $request, PurchaseInvoice $purchaseInvoice): JsonResponse
    {
        $this->allow($request, 'delete');
        $purchaseInvoice->attachments->each->delete();
        $purchaseInvoice->items()->delete();
        $purchaseInvoice->delete();

        return response()->json(['message' => 'Invoice deleted.']);
    }

    public function addPayment(Request $request, PurchaseInvoice $purchaseInvoice): JsonResponse
    {
        $this->allow($request, 'edit');
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'date' => ['required', 'date'],
            'payment_mode_id' => ['nullable', 'integer', Rule::exists('payment_modes', 'id')->where('company_id', $request->user()->company_id)],
            'transaction_id' => ['nullable', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);
        $this->purchases->recordPayment($purchaseInvoice, $data);

        return response()->json(['data' => $this->detail($purchaseInvoice->refresh(), $request)], 201);
    }

    public function deletePayment(Request $request, PurchaseInvoice $purchaseInvoice, PurchaseInvoicePayment $payment): JsonResponse
    {
        $this->allow($request, 'edit');
        abort_if($payment->purchase_invoice_id !== $purchaseInvoice->id, 404);
        $this->purchases->deletePayment($payment);

        return response()->json(['data' => $this->detail($purchaseInvoice->refresh(), $request)]);
    }

    /**
     * Attach the vendor's bill (scan / PDF).
     */
    public function upload(Request $request, PurchaseInvoice $purchaseInvoice): JsonResponse
    {
        $this->allow($request, 'edit');
        $request->validate(['files' => ['required', 'array', 'max:10'], 'files.*' => ['file', 'max:20480']]);
        foreach ($request->file('files') as $file) {
            $purchaseInvoice->attachments()->create([
                'user_id' => $request->user()->id,
                'disk_path' => $file->store('attachments/'.$request->user()->company_id.'/purchase_invoices/'.$purchaseInvoice->id, 'local'),
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ]);
        }

        return response()->json(['data' => $this->detail($purchaseInvoice, $request)], 201);
    }

    public function pdf(Request $request, PurchaseInvoice $purchaseInvoice): Response
    {
        $this->allow($request, 'view');

        return PurchasePdf::render($purchaseInvoice, $request->boolean('inline'));
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;

        return $request->validate([
            'vendor_id' => ['required', 'integer', Rule::exists('vendors', 'id')->where('company_id', $company)],
            'vendor_invoice_number' => ['nullable', 'string', 'max:191'],
            'purchase_order_id' => ['nullable', 'integer', Rule::exists('purchase_orders', 'id')->where('company_id', $company)],
            'currency_id' => ['nullable', 'integer', Rule::exists('currencies', 'id')->where('company_id', $company)],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:invoice_date'],
            'transaction_id' => ['nullable', 'string', 'max:191'],
            'vendor_note' => ['nullable', 'string', 'max:10000'],
            'admin_note' => ['nullable', 'string', 'max:10000'],
            'terms' => ['nullable', 'string', 'max:20000'],
            ...$this->moneyRules(),
            ...$this->lineRules($request),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(PurchaseInvoice $i, Request $request): array
    {
        $i->load(['items', 'currency', 'vendor', 'order:id,code', 'payments.paymentMode', 'attachments.user']);
        $user = $request->user();

        return [
            ...collect($i->only(['id', 'invoice_number', 'vendor_invoice_number', 'vendor_id', 'purchase_order_id', 'currency_id', 'payment_status',
                'transaction_id', 'vendor_note', 'admin_note', 'terms', 'discount_type']))->all(),
            'invoice_date' => $i->invoice_date?->toDateString(), 'due_date' => $i->due_date?->toDateString(),
            'vendor' => $i->vendor?->only(['id', 'name', 'vat', 'phone', 'address', 'city', 'state', 'zip', 'country']),
            'order' => $i->order, 'currency' => $i->currency?->only(['id', 'symbol', 'placement', 'name']),
            'subtotal' => (float) $i->subtotal, 'discount_percent' => (float) $i->discount_percent, 'discount_total' => (float) $i->discount_total,
            'total_tax' => (float) $i->total_tax, 'shipping_fee' => (float) $i->shipping_fee, 'total' => (float) $i->total,
            'amount_paid' => $i->amountPaid(), 'amount_due' => $i->amountDue(),
            'items' => $this->lines($i),
            'payments' => $i->payments->map(fn (PurchaseInvoicePayment $p) => [
                'id' => $p->id, 'amount' => (float) $p->amount, 'date' => $p->date?->toDateString(), 'payment_mode' => $p->paymentMode?->name,
                'transaction_id' => $p->transaction_id, 'note' => $p->note,
            ]),
            'attachments' => AttachmentResource::collection($i->attachments)->resolve($request),
            'can' => ['edit' => $user->hasPermission('purchase_invoices', 'edit'), 'delete' => $user->hasPermission('purchase_invoices', 'delete')],
        ];
    }

    private function allow(Request $request, string $capability): void
    {
        abort_unless($request->user()->hasPermission('purchase_invoices', $capability), 403);
    }
}
