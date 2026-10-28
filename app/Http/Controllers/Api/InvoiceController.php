<?php

namespace App\Http\Controllers\Api;

use App\Enums\InvoiceStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\InvoiceRequest;
use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use App\Models\PaymentMode;
use App\Services\InvoiceService;
use App\Services\Options;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class InvoiceController extends Controller
{
    private const SORTABLE = ['id', 'number', 'date', 'due_date', 'total', 'status'];

    public function __construct(private InvoiceService $invoices) {}

    /**
     * Perfex invoices list: filters (status, customer, project, sale agent, dates, recurring, not sent)
     * and the summary at the top (outstanding, past due, paid).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Invoice::class);

        $base = Invoice::query()
            ->visibleTo($request->user())
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->integer('sale_agent_id'), fn (Builder $q, int $id) => $q->where('sale_agent_id', $id))
            ->when($request->date('from'), fn (Builder $q, $d) => $q->whereDate('date', '>=', $d))
            ->when($request->date('to'), fn (Builder $q, $d) => $q->whereDate('date', '<=', $d))
            ->when($request->boolean('recurring'), fn (Builder $q) => $q->whereNotNull('repeat_every'))
            ->when($request->boolean('not_sent'), fn (Builder $q) => $q->where('sent', false)->where('status', '!=', InvoiceStatus::Draft))
            ->when($request->string('search')->trim()->value(), function (Builder $q, string $search) {
                $digits = (int) preg_replace('/\D/', '', $search);
                $q->where(fn (Builder $q) => $q
                    ->whereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$search}%"))
                    ->orWhere('admin_note', 'like', "%{$search}%")
                    ->when($digits > 0, fn (Builder $q) => $q->orWhere('number', $digits)));
            });

        $summary = (clone $base)->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled])
            ->withSum('payments', 'amount')->withSum('appliedCredits', 'amount')->get(['id', 'total', 'status', 'due_date']);
        $statusCounts = (clone $base)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $sort = in_array($request->input('sort'), self::SORTABLE, true) ? $request->input('sort') : 'id';

        $invoices = $base
            ->when($request->has('status'), fn (Builder $q) => $q->whereIn('status', array_map('intval', (array) $request->input('status'))))
            ->with(['customer:id,name', 'project:id,name', 'currency', 'tags'])
            ->withSum('payments', 'amount')
            ->withSum('appliedCredits', 'amount')
            ->orderBy($sort, $request->input('direction') === 'asc' ? 'asc' : 'desc')
            ->paginate($request->integer('per_page', 25));

        return InvoiceResource::collection($invoices)->additional(['meta' => [
            'status_counts' => collect(InvoiceStatus::cases())->mapWithKeys(fn ($s) => [$s->value => (int) ($statusCounts[$s->value] ?? 0)]),
            'summary' => [
                'outstanding' => round($summary->sum(fn ($i) => (float) $i->total - (float) $i->payments_sum_amount - (float) $i->applied_credits_sum_amount), 2),
                'past_due' => round($summary->where('status', InvoiceStatus::Overdue)->sum(fn ($i) => (float) $i->total - (float) $i->payments_sum_amount - (float) $i->applied_credits_sum_amount), 2),
                'paid' => round($summary->sum(fn ($i) => (float) $i->payments_sum_amount), 2),
            ],
        ]]);
    }

    /**
     * Defaults for a new invoice form (Perfex fills these from Setup): next number, due date,
     * terms, client note, payment modes.
     */
    public function defaults(Request $request): JsonResponse
    {
        $this->authorize('create', Invoice::class);
        $date = today()->toDateString();

        return response()->json(['data' => [
            'prefix' => Options::get('invoice_prefix'),
            'next_number' => Options::formatNumber((int) Options::get('next_invoice_number'), (int) Options::get('invoice_number_format'), Options::get('invoice_prefix'), $date),
            'date' => $date,
            'due_date' => $this->invoices->defaultDueDate($date),
            'terms' => Options::get('predefined_terms_invoice'),
            'client_note' => Options::get('predefined_clientnote_invoice'),
            'allowed_payment_modes' => PaymentMode::where('active', true)->where('expenses_only', false)->where('selected_by_default', true)->pluck('id'),
        ]]);
    }

    public function store(InvoiceRequest $request): InvoiceResource
    {
        $this->authorize('create', Invoice::class);

        return new InvoiceResource($this->loadForView($this->invoices->create($request->validated())));
    }

    public function show(Invoice $invoice): InvoiceResource
    {
        $this->authorize('view', $invoice);

        return new InvoiceResource($this->loadForView($invoice));
    }

    public function update(InvoiceRequest $request, Invoice $invoice): InvoiceResource
    {
        $this->authorize('update', $invoice);

        return new InvoiceResource($this->loadForView($this->invoices->update($invoice, $request->validated())));
    }

    public function destroy(Invoice $invoice): JsonResponse
    {
        $this->authorize('delete', $invoice);
        $invoice->delete();
        Options::releaseNumber('next_invoice_number', (int) $invoice->number, (int) $invoice->company_id);

        return response()->json(['message' => 'Invoice deleted.']);
    }

    /**
     * Status actions from the invoice page: mark as sent, cancel, uncancel, publish a draft.
     */
    public function action(Request $request, Invoice $invoice): InvoiceResource
    {
        $this->authorize('update', $invoice);
        $action = $request->validate(['action' => ['required', Rule::in(['mark_sent', 'cancel', 'uncancel', 'publish'])]])['action'];

        match ($action) {
            'mark_sent' => $this->invoices->markSent($invoice),
            'cancel' => $this->invoices->cancel($invoice),
            'uncancel' => $this->invoices->uncancel($invoice),
            'publish' => $this->invoices->publishDraft($invoice),
        };

        return new InvoiceResource($this->loadForView($invoice->refresh()));
    }

    public function copy(Invoice $invoice): InvoiceResource
    {
        $this->authorize('view', $invoice);
        $this->authorize('create', Invoice::class);

        return new InvoiceResource($this->loadForView($this->invoices->copy($invoice)));
    }

    public function pdf(Request $request, Invoice $invoice): Response
    {
        $this->authorize('view', $invoice);

        return SalesPdf::invoice($invoice, $request->boolean('inline'));
    }

    private function loadForView(Invoice $invoice): Invoice
    {
        return $invoice->load(['customer', 'project:id,name', 'currency', 'saleAgent', 'items.taxes', 'payments.paymentMode', 'appliedCredits.creditNote', 'tags']);
    }
}
