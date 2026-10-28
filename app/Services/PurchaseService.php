<?php

namespace App\Services;

use App\Models\PurchaseApprovalSetting;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoicePayment;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Tax;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Perfex purchase module logic: numbering (#PR / #PO / BILL#), line and total calculation,
 * the approval workflow, converting request → order → invoice, and invoice payments.
 */
class PurchaseService
{
    public const DRAFT = 1;

    public const APPROVED = 2;

    public const REJECTED = 3;

    public const CANCELLED = 4;

    public const STATUS_LABELS = [1 => 'Draft', 2 => 'Approved', 3 => 'Rejected', 4 => 'Cancelled'];

    public function __construct(private Notifier $notifier) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function createRequest(array $data): PurchaseRequest
    {
        return DB::transaction(function () use ($data) {
            $number = Options::takeNextNumber('next_pr_number');
            $request = PurchaseRequest::create([
                ...Arr::only($data, ['name', 'description', 'department', 'project_id', 'currency_id']),
                'number' => $number,
                'code' => Options::get('pur_request_prefix').'-'.str_pad((string) $number, 5, '0', STR_PAD_LEFT),
                'requester_id' => $data['requester_id'] ?? Auth::id(),
                'request_date' => $data['request_date'] ?? now(),
                'status' => self::DRAFT,
                'hash' => Str::random(32),
                'created_by' => Auth::id(),
            ]);
            $this->writeItems($request, $data['items']);

            return $request;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateRequest(PurchaseRequest $request, array $data): PurchaseRequest
    {
        return DB::transaction(function () use ($request, $data) {
            $request->update(Arr::only($data, ['name', 'description', 'department', 'project_id', 'currency_id', 'requester_id', 'request_date']));
            $this->writeItems($request, $data['items']);

            return $request;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function createOrder(array $data): PurchaseOrder
    {
        return DB::transaction(function () use ($data) {
            $number = Options::takeNextNumber('next_po_number');
            $order = PurchaseOrder::create([
                ...Arr::only($data, self::ORDER_FIELDS),
                'number' => $number,
                'code' => Options::get('pur_order_prefix').'-'.str_pad((string) $number, 5, '0', STR_PAD_LEFT).'-'.now()->format('M-Y'),
                'status' => self::DRAFT,
                'hash' => Str::random(32),
                'created_by' => Auth::id(),
            ]);
            $this->writeItems($order, $data['items'], $data);

            return $order;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateOrder(PurchaseOrder $order, array $data): PurchaseOrder
    {
        return DB::transaction(function () use ($order, $data) {
            $order->update(Arr::only($data, self::ORDER_FIELDS));
            $this->writeItems($order, $data['items'], $data);

            return $order;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function createInvoice(array $data): PurchaseInvoice
    {
        return DB::transaction(function () use ($data) {
            $number = Options::takeNextNumber('next_pur_inv_number');
            $invoice = PurchaseInvoice::create([
                ...Arr::only($data, self::INVOICE_FIELDS),
                'number' => $number,
                'invoice_number' => Options::get('pur_inv_prefix').$number,
                'payment_status' => 'unpaid',
                'created_by' => Auth::id(),
            ]);
            $this->writeItems($invoice, $data['items'], $data);

            return $invoice;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateInvoice(PurchaseInvoice $invoice, array $data): PurchaseInvoice
    {
        return DB::transaction(function () use ($invoice, $data) {
            $invoice->update(Arr::only($data, self::INVOICE_FIELDS));
            $this->writeItems($invoice, $data['items'], $data);
            $this->refreshPaymentStatus($invoice);

            return $invoice;
        });
    }

    private const ORDER_FIELDS = [
        'name', 'vendor_id', 'purchase_request_id', 'project_id', 'currency_id', 'order_date', 'delivery_date', 'buyer_id',
        'vendor_note', 'terms', 'delivery_status',
    ];

    private const INVOICE_FIELDS = [
        'vendor_invoice_number', 'vendor_id', 'purchase_order_id', 'currency_id', 'invoice_date', 'due_date', 'transaction_id',
        'vendor_note', 'admin_note', 'terms',
    ];

    /**
     * Replace a document's lines and recompute its totals: tax per line, then discount
     * (percent or fixed, on the subtotal) and shipping.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @param  array<string, mixed>  $data  discount_type, discount_percent, discount_total, shipping_fee
     */
    public function writeItems(Model $document, array $lines, array $data = []): void
    {
        $taxes = Tax::whereIn('id', collect($lines)->pluck('tax_id')->filter())->get()->keyBy('id');
        $document->items()->delete();
        $subtotal = 0.0;
        $totalTax = 0.0;

        foreach (array_values($lines) as $i => $line) {
            $amount = round((float) $line['qty'] * (float) $line['unit_price'], 2);
            $tax = ! empty($line['tax_id']) ? $taxes->get($line['tax_id']) : null;
            $rate = $tax ? (float) $tax->rate : (float) ($line['tax_rate'] ?? 0);
            $taxValue = round($amount * $rate / 100, 2);
            $document->items()->create([
                'item_id' => $line['item_id'] ?? null,
                'description' => $line['description'],
                'long_description' => $line['long_description'] ?? null,
                'unit' => $line['unit'] ?? null,
                'qty' => $line['qty'],
                'unit_price' => $line['unit_price'],
                'tax_name' => $tax?->name ?? ($line['tax_name'] ?? null),
                'tax_rate' => $rate,
                'tax_value' => $taxValue,
                'total' => $amount + $taxValue,
                'item_order' => $i + 1,
            ]);
            $subtotal += $amount;
            $totalTax += $taxValue;
        }

        $totals = ['subtotal' => round($subtotal, 2), 'total_tax' => round($totalTax, 2)];
        if ($document instanceof PurchaseRequest) {
            $document->update([...$totals, 'total' => round($subtotal + $totalTax, 2)]);

            return;
        }

        $type = $data['discount_type'] ?? null;
        $discount = match ($type) {
            'percent' => round($subtotal * (float) ($data['discount_percent'] ?? 0) / 100, 2),
            'fixed' => round((float) ($data['discount_total'] ?? 0), 2),
            default => 0.0,
        };
        $shipping = round((float) ($data['shipping_fee'] ?? 0), 2);
        $document->update([
            ...$totals,
            'discount_type' => $type,
            'discount_percent' => $type === 'percent' ? (float) ($data['discount_percent'] ?? 0) : 0,
            'discount_total' => $discount,
            'shipping_fee' => $shipping,
            'total' => round($subtotal + $totalTax - $discount + $shipping, 2),
        ]);
    }

    // Approval ------------------------------------------------------------------------------------

    /**
     * Perfex "Send request approve": every approver in the setting gets a pending decision and a
     * notification. Without an approval setting the document is approved straight away.
     */
    public function sendForApproval(PurchaseRequest|PurchaseOrder $document): void
    {
        if ($document->status !== self::DRAFT) {
            throw ValidationException::withMessages(['status' => 'Only a draft can be sent for approval.']);
        }
        $related = $document instanceof PurchaseRequest ? 'pur_request' : 'pur_order';
        $approvers = collect(PurchaseApprovalSetting::where('related', $related)->first()?->approver_ids ?? [])->map(fn ($id) => (int) $id)->unique();

        if ($approvers->isEmpty()) {
            $document->update(['status' => self::APPROVED]);

            return;
        }

        DB::transaction(function () use ($document, $approvers) {
            $document->approvals()->delete();
            foreach ($approvers as $staffId) {
                $document->approvals()->create(['staff_id' => $staffId, 'sender_id' => Auth::id()]);
            }
        });
        $label = $document instanceof PurchaseRequest ? 'purchase request' : 'purchase order';
        $this->notifier->notify($approvers, "sent {$label} {$document->code} for your approval", $this->link($document));
    }

    /**
     * An approver approves or rejects. One rejection rejects the document; when everyone has
     * approved it is approved. The person who sent it is told.
     */
    public function decide(PurchaseRequest|PurchaseOrder $document, User $user, bool $approve, ?string $note): void
    {
        $approval = $document->approvals()->where('staff_id', $user->id)->whereNull('decision')->first();
        if (! $approval) {
            throw ValidationException::withMessages(['decision' => 'There is nothing waiting for your approval here.']);
        }

        DB::transaction(function () use ($document, $approval, $approve, $note) {
            $approval->update(['decision' => $approve ? self::APPROVED : self::REJECTED, 'note' => $note, 'decided_at' => now()]);
            if (! $approve) {
                $document->update(['status' => self::REJECTED]);
            } elseif (! $document->approvals()->where(fn ($q) => $q->whereNull('decision')->orWhere('decision', '!=', self::APPROVED))->exists()) {
                $document->update(['status' => self::APPROVED]);
            }
        });

        $this->notifier->notify([$approval->sender_id, $document->created_by], ($approve ? 'approved ' : 'rejected ').$document->code, $this->link($document));
    }

    // Conversions ---------------------------------------------------------------------------------

    /**
     * Perfex: an approved purchase request becomes a purchase order for a vendor.
     */
    public function orderFromRequest(PurchaseRequest $request, int $vendorId): PurchaseOrder
    {
        if ($request->status !== self::APPROVED) {
            throw ValidationException::withMessages(['status' => 'Only an approved purchase request can be converted to a purchase order.']);
        }

        return $this->createOrder([
            'name' => $request->name,
            'vendor_id' => $vendorId,
            'purchase_request_id' => $request->id,
            'project_id' => $request->project_id,
            'currency_id' => $request->currency_id,
            'order_date' => today()->toDateString(),
            'terms' => Options::get('pur_terms_and_conditions'),
            'vendor_note' => Options::get('pur_vendor_note'),
            'items' => $this->linesOf($request),
        ]);
    }

    public function invoiceFromOrder(PurchaseOrder $order): PurchaseInvoice
    {
        if ($order->status !== self::APPROVED) {
            throw ValidationException::withMessages(['status' => 'Only an approved purchase order can be converted to an invoice.']);
        }

        return $this->createInvoice([
            'vendor_id' => $order->vendor_id,
            'purchase_order_id' => $order->id,
            'currency_id' => $order->currency_id,
            'invoice_date' => today()->toDateString(),
            'terms' => $order->terms,
            'discount_type' => $order->discount_type,
            'discount_percent' => $order->discount_percent,
            'discount_total' => $order->discount_total,
            'shipping_fee' => $order->shipping_fee,
            'items' => $this->linesOf($order),
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function linesOf(Model $document): array
    {
        return $document->items->map(fn ($i) => $i->only(['item_id', 'description', 'long_description', 'unit', 'qty', 'unit_price', 'tax_name', 'tax_rate']))->all();
    }

    // Payments ------------------------------------------------------------------------------------

    /**
     * @param  array<string, mixed>  $data
     */
    public function recordPayment(PurchaseInvoice $invoice, array $data): PurchaseInvoicePayment
    {
        $due = $invoice->amountDue();
        if (round((float) $data['amount'], 2) > $due) {
            throw ValidationException::withMessages(['amount' => 'The amount is more than the amount due ('.number_format($due, 2).').']);
        }

        return DB::transaction(function () use ($invoice, $data) {
            $payment = $invoice->payments()->create([...Arr::only($data, ['amount', 'payment_mode_id', 'date', 'transaction_id', 'note']), 'created_by' => Auth::id()]);
            $this->refreshPaymentStatus($invoice);

            return $payment;
        });
    }

    public function deletePayment(PurchaseInvoicePayment $payment): void
    {
        $invoice = $payment->invoice;
        $payment->delete();
        $this->refreshPaymentStatus($invoice);
    }

    public function refreshPaymentStatus(PurchaseInvoice $invoice): void
    {
        $paid = $invoice->amountPaid();
        $invoice->update(['payment_status' => match (true) {
            $paid <= 0 => 'unpaid',
            $paid + 0.001 >= (float) $invoice->total => 'paid',
            default => 'partially_paid',
        }]);
    }

    private function link(PurchaseRequest|PurchaseOrder $document): string
    {
        return $document instanceof PurchaseRequest ? "/purchase/requests/{$document->id}" : "/purchase/orders/{$document->id}";
    }
}
