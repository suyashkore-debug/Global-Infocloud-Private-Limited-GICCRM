<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProposalStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ProposalRequest;
use App\Http\Resources\EstimateResource;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\ProposalResource;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Proposal;
use App\Services\EstimateRequests;
use App\Services\Options;
use App\Services\ProposalService;
use App\Services\SalesPdf;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class ProposalController extends Controller
{
    public function __construct(private ProposalService $proposals) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Proposal::class);

        $base = Proposal::query()
            ->visibleTo($request->user())
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('assigned_id'), fn (Builder $q, int $id) => $q->where('assigned_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->where('subject', 'like', "%{$s}%")
                ->orWhere('proposal_to', 'like', "%{$s}%")
                ->orWhere('email', 'like', "%{$s}%")));

        $statusCounts = (clone $base)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $proposals = $base
            ->when($request->has('status'), fn (Builder $q) => $q->whereIn('status', array_map('intval', (array) $request->input('status'))))
            ->with(['customer:id,name', 'project:id,name', 'currency', 'tags', 'assigned'])
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return ProposalResource::collection($proposals)->additional(['meta' => [
            'status_counts' => collect(ProposalStatus::cases())->mapWithKeys(fn ($s) => [$s->value => (int) ($statusCounts[$s->value] ?? 0)]),
        ]]);
    }

    public function defaults(): JsonResponse
    {
        $this->authorize('create', Proposal::class);
        $days = (int) Options::get('proposal_due_after');

        return response()->json(['data' => [
            'date' => today()->toDateString(),
            'open_till' => $days > 0 ? CarbonImmutable::today()->addDays($days)->toDateString() : null,
        ]]);
    }

    public function store(ProposalRequest $request): ProposalResource
    {
        $this->authorize('create', Proposal::class);
        $proposal = $this->proposals->create($request->validated());
        EstimateRequests::completeWith($request->validated('estimate_request_id'), $proposal);
        $proposal->lead?->logActivity('Created proposal '.$proposal->formattedNumber());

        return new ProposalResource($this->loadForView($proposal));
    }

    public function show(Proposal $proposal): ProposalResource
    {
        $this->authorize('view', $proposal);

        return new ProposalResource($this->loadForView($proposal));
    }

    public function update(ProposalRequest $request, Proposal $proposal): ProposalResource
    {
        $this->authorize('update', $proposal);

        return new ProposalResource($this->loadForView($this->proposals->update($proposal, $request->validated())));
    }

    public function destroy(Proposal $proposal): JsonResponse
    {
        $this->authorize('delete', $proposal);
        $proposal->delete();

        return response()->json(['message' => 'Proposal deleted.']);
    }

    public function status(Request $request, Proposal $proposal): ProposalResource
    {
        $this->authorize('update', $proposal);
        $data = $request->validate(['status' => ['required', Rule::enum(ProposalStatus::class)]]);

        $this->proposals->markStatus($proposal, ProposalStatus::from((int) $data['status']));

        return new ProposalResource($this->loadForView($proposal->refresh()));
    }

    public function convert(Request $request, Proposal $proposal): JsonResponse
    {
        $this->authorize('update', $proposal);
        $to = $request->validate(['to' => ['required', Rule::in(['estimate', 'invoice'])]])['to'];

        if ($to === 'estimate') {
            $this->authorize('create', Estimate::class);
            $estimate = $this->proposals->convertToEstimate($proposal);

            return (new EstimateResource($estimate->load(['customer', 'currency'])))->additional(['type' => 'estimate'])->response();
        }

        $this->authorize('create', Invoice::class);
        $invoice = $this->proposals->convertToInvoice($proposal);

        return (new InvoiceResource($invoice->load(['customer', 'currency'])))->additional(['type' => 'invoice'])->response();
    }

    public function copy(Proposal $proposal): ProposalResource
    {
        $this->authorize('view', $proposal);
        $this->authorize('create', Proposal::class);

        return new ProposalResource($this->loadForView($this->proposals->copy($proposal)));
    }

    public function pdf(Request $request, Proposal $proposal): Response
    {
        $this->authorize('view', $proposal);

        return SalesPdf::proposal($proposal, $request->boolean('inline'));
    }

    private function loadForView(Proposal $proposal): Proposal
    {
        return $proposal->load(['customer', 'lead', 'project:id,name', 'currency', 'items.taxes', 'tags', 'assigned', 'estimate', 'invoice']);
    }
}
