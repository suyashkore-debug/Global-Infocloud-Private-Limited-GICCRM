<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\Emails;
use App\Services\InvoiceService;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Sales → Payments, and "Record payment" on an invoice.
 */
class PaymentController extends Controller
{
    public function __construct(private InvoiceService $invoices) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->hasPermission('payments', 'view'), 403);

        $payments = Payment::query()
            ->whereHas('invoice', fn (Builder $q) => $q->visibleTo($request->user()))
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->whereHas('invoice', fn (Builder $i) => $i->where('customer_id', $id)))
            ->when($request->integer('payment_mode_id'), fn (Builder $q, int $id) => $q->where('payment_mode_id', $id))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->where('transaction_id', 'like', "%{$s}%")
                ->orWhereHas('invoice.customer', fn (Builder $c) => $c->where('name', 'like', "%{$s}%"))))
            ->with(['invoice.customer:id,name', 'invoice.currency', 'paymentMode'])
            ->latest('date')->latest('id')
            ->paginate($request->integer('per_page', 25));

        return PaymentResource::collection($payments);
    }

    public function store(Request $request, Invoice $invoice): PaymentResource
    {
        $this->authorize('recordPayment', $invoice);

        $payment = $this->invoices->recordPayment($invoice, $this->validated($request));
        $this->sendPaymentEmails($payment->load(['invoice.customer', 'invoice.currency']), ! $request->boolean('do_not_send_email'));

        return new PaymentResource($payment->load(['invoice.customer', 'invoice.currency', 'paymentMode']));
    }

    public function update(Request $request, Payment $payment): PaymentResource
    {
        abort_unless($request->user()->hasPermission('payments', 'edit'), 403);

        $payment->update($this->validated($request));
        $this->invoices->refreshStatus($payment->invoice);

        return new PaymentResource($payment->load(['invoice.customer', 'invoice.currency', 'paymentMode']));
    }

    public function destroy(Request $request, Payment $payment): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments', 'delete'), 403);
        $this->invoices->deletePayment($payment);

        return response()->json(['message' => 'Payment deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'date' => ['required', 'date'],
            'payment_mode_id' => ['nullable', 'integer', Rule::exists('payment_modes', 'id')->where('company_id', $request->user()->company_id)],
            'payment_method' => ['nullable', 'string', 'max:200'],
            'transaction_id' => ['nullable', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    /**
     * Perfex: the customer's contacts get "Invoice Payment Recorded" (unless the person recording
     * ticks "don't send"), and the invoice's staff get the staff version.
     */
    private function sendPaymentEmails(Payment $payment, bool $toCustomer): void
    {
        $invoice = $payment->invoice;
        $company = (int) $invoice->company_id;
        $fields = Emails::payment($payment);

        if ($toCustomer && $invoice->customer) {
            $pdf = null;
            foreach ($invoice->customer->contacts()->where('active', true)->where('invoice_emails', true)->get() as $contact) {
                Emails::send('invoice-payment-recorded', $company, (string) $contact->email, [...$fields, ...Emails::contact($contact)], [
                    'rel' => $invoice,
                    'attachments' => [$pdf ??= SalesPdf::attachment($invoice->refresh()->load(['customer', 'currency']))],
                ]);
            }
        }
        Emails::toStaff('invoice-payment-recorded-to-staff', $company, array_filter([$invoice->created_by, $invoice->sale_agent_id]), $fields, $invoice);
    }
}
