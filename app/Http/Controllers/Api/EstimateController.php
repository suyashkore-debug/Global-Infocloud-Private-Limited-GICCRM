<?php

namespace App\Http\Controllers\Api;

use App\Enums\EstimateStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\EstimateRequest;
use App\Http\Resources\EstimateResource;
use App\Http\Resources\InvoiceResource;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Services\EstimateRequests;
use App\Services\EstimateService;
use App\Services\Options;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class EstimateController extends Controller
{
    public function __construct(private EstimateService $estimates) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Estimate::class);

        $base = Estimate::query()
            ->visibleTo($request->user())
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->integer('sale_agent_id'), fn (Builder $q, int $id) => $q->where('sale_agent_id', $id))
            ->when($request->boolean('not_invoiced'), fn (Builder $q) => $q->whereNull('invoice_id'))
            ->when($request->string('search')->trim()->value(), function (Builder $q, string $search) {
                $digits = (int) preg_replace('/\D/', '', $search);
                $q->where(fn (Builder $q) => $q
                    ->whereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$search}%"))
                    ->orWhere('reference_no', 'like', "%{$search}%")
                    ->when($digits > 0, fn (Builder $q) => $q->orWhere('number', $digits)));
            });

        $statusCounts = (clone $base)->selectRaw('status, count(*) as total, sum(total) as amount')->groupBy('status')->get()->keyBy('status');

        $estimates = $base
            ->when($request->has('status'), fn (Builder $q) => $q->whereIn('status', array_map('intval', (array) $request->input('status'))))
            ->with(['customer:id,name', 'project:id,name', 'currency', 'tags', 'invoice'])
            ->orderBy($request->input('sort') === 'pipeline' ? 'pipeline_order' : 'id', $request->input('sort') === 'pipeline' ? 'asc' : 'desc')
            ->paginate($request->integer('per_page', 25));

        return EstimateResource::collection($estimates)->additional(['meta' => [
            'status_counts' => collect(EstimateStatus::cases())->mapWithKeys(fn ($s) => [$s->value => [
                'count' => (int) ($statusCounts[$s->value]->total ?? 0),
                'amount' => round((float) ($statusCounts[$s->value]->amount ?? 0), 2),
            ]]),
        ]]);
    }

    public function defaults(): JsonResponse
    {
        $this->authorize('create', Estimate::class);
        $date = today()->toDateString();

        return response()->json(['data' => [
            'next_number' => Options::formatNumber((int) Options::get('next_estimate_number'), (int) Options::get('estimate_number_format'), Options::get('estimate_prefix'), $date),
            'date' => $date,
            'expiry_date' => $this->estimates->defaultExpiryDate($date),
            'terms' => Options::get('predefined_terms_estimate'),
            'client_note' => Options::get('predefined_clientnote_estimate'),
        ]]);
    }

    public function store(EstimateRequest $request): EstimateResource
    {
        $this->authorize('create', Estimate::class);
        $estimate = $this->estimates->create($request->validated());
        EstimateRequests::completeWith($request->validated('estimate_request_id'), $estimate);

        return new EstimateResource($this->loadForView($estimate));
    }

    public function show(Estimate $estimate): EstimateResource
    {
        $this->authorize('view', $estimate);

        return new EstimateResource($this->loadForView($estimate));
    }

    public function update(EstimateRequest $request, Estimate $estimate): EstimateResource
    {
        $this->authorize('update', $estimate);

        return new EstimateResource($this->loadForView($this->estimates->update($estimate, $request->validated())));
    }

    public function destroy(Estimate $estimate): JsonResponse
    {
        $this->authorize('delete', $estimate);
        $estimate->delete();
        Options::releaseNumber('next_estimate_number', (int) $estimate->number, (int) $estimate->company_id);

        return response()->json(['message' => 'Estimate deleted.']);
    }

    /**
     * Mark as sent / draft / declined / accepted / expired.
     */
    public function action(Request $request, Estimate $estimate): EstimateResource
    {
        $this->authorize('update', $estimate);
        $data = $request->validate([
            'action' => ['required', Rule::in(['mark_sent', 'status'])],
            'status' => ['required_if:action,status', 'nullable', Rule::enum(EstimateStatus::class)],
        ]);

        $data['action'] === 'mark_sent'
            ? $this->estimates->markSent($estimate)
            : $this->estimates->markStatus($estimate, EstimateStatus::from((int) $data['status']));

        return new EstimateResource($this->loadForView($estimate->refresh()));
    }

    public function convertToInvoice(Request $request, Estimate $estimate): InvoiceResource
    {
        $this->authorize('update', $estimate);
        $this->authorize('create', Invoice::class);

        $invoice = $this->estimates->convertToInvoice($estimate, $request->boolean('draft'));

        return new InvoiceResource($invoice->load(['customer', 'currency']));
    }

    public function copy(Estimate $estimate): EstimateResource
    {
        $this->authorize('view', $estimate);
        $this->authorize('create', Estimate::class);

        return new EstimateResource($this->loadForView($this->estimates->copy($estimate)));
    }

    /**
     * Pipeline (kanban by status): move a card to a column.
     */
    public function move(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::enum(EstimateStatus::class)],
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        foreach (array_values($data['order']) as $position => $id) {
            $estimate = Estimate::find($id);
            if ($estimate && $request->user()->can('update', $estimate)) {
                $estimate->update(['status' => (int) $data['status'], 'pipeline_order' => $position + 1]);
            }
        }

        return response()->json(['message' => 'Saved.']);
    }

    public function pdf(Request $request, Estimate $estimate): Response
    {
        $this->authorize('view', $estimate);

        return SalesPdf::estimate($estimate, $request->boolean('inline'));
    }

    private function loadForView(Estimate $estimate): Estimate
    {
        return $estimate->load(['customer', 'project:id,name', 'currency', 'saleAgent', 'items.taxes', 'tags', 'invoice']);
    }
}
