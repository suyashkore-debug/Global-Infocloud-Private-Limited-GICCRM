<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommentResource;
use App\Http\Resources\ContractResource;
use App\Models\Contract;
use App\Models\ContractComment;
use App\Services\ContractService;
use App\Services\Options;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class ContractController extends Controller
{
    public function __construct(private ContractService $contracts) {}

    /**
     * Perfex contracts list and summary (active, expired, about to expire, recently added, trash).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Contract::class);

        $base = Contract::query()
            ->visibleTo($request->user())
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('contract_type_id'), fn (Builder $q, int $id) => $q->where('contract_type_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->where('subject', 'like', "%{$s}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$s}%"))));

        $soon = today()->addDays(max(1, (int) Options::get('contract_expiration_before')));
        $active = fn (Builder $q) => $q->where('trash', false)->where(fn ($q) => $q->whereNull('end_date')->orWhereDate('end_date', '>=', today()));
        $summary = [
            'active' => (clone $base)->where($active)->count(),
            'expired' => (clone $base)->where('trash', false)->whereDate('end_date', '<', today())->count(),
            'about_to_expire' => (clone $base)->where('trash', false)->whereBetween('end_date', [today(), $soon])->count(),
            'recently_added' => (clone $base)->where('trash', false)->where('created_at', '>=', now()->subDays(7))->count(),
            'trash' => (clone $base)->where('trash', true)->count(),
        ];

        $filter = $request->input('filter');
        $contracts = $base
            ->when($filter === 'trash', fn (Builder $q) => $q->where('trash', true), fn (Builder $q) => $q->where('trash', false))
            ->when($filter === 'active', $active)
            ->when($filter === 'expired', fn (Builder $q) => $q->whereDate('end_date', '<', today()))
            ->when($filter === 'about_to_expire', fn (Builder $q) => $q->whereBetween('end_date', [today(), $soon]))
            ->when($filter === 'signed', fn (Builder $q) => $q->where('signed', true))
            ->when($filter === 'not_signed', fn (Builder $q) => $q->where('signed', false))
            ->with(['customer:id,name', 'type', 'project:id,name'])
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return ContractResource::collection($contracts)->additional(['meta' => ['summary' => $summary]]);
    }

    public function store(Request $request): ContractResource
    {
        $this->authorize('create', Contract::class);

        return new ContractResource($this->loadForView($this->contracts->create($this->validated($request))));
    }

    public function show(Contract $contract): ContractResource
    {
        $this->authorize('view', $contract);

        return new ContractResource($this->loadForView($contract));
    }

    public function update(Request $request, Contract $contract): ContractResource
    {
        $this->authorize('update', $contract);

        return new ContractResource($this->loadForView($this->contracts->update($contract, $this->validated($request))));
    }

    public function destroy(Contract $contract): JsonResponse
    {
        $this->authorize('delete', $contract);
        $contract->attachments()->get()->each->delete();
        $contract->delete();

        return response()->json(['message' => 'Contract deleted.']);
    }

    public function renew(Request $request, Contract $contract): ContractResource
    {
        $this->authorize('update', $contract);
        $data = $request->validate([
            'new_start_date' => ['required', 'date'],
            'new_end_date' => ['nullable', 'date', 'after_or_equal:new_start_date'],
            'new_value' => ['nullable', 'numeric', 'min:0'],
        ]);

        return new ContractResource($this->loadForView($this->contracts->renew($contract, $data)));
    }

    public function action(Request $request, Contract $contract): ContractResource
    {
        $this->authorize('update', $contract);
        $action = $request->validate(['action' => ['required', Rule::in(['sign', 'unsign', 'trash', 'restore'])]])['action'];

        match ($action) {
            'sign' => $this->contracts->markSigned($contract, true),
            'unsign' => $this->contracts->markSigned($contract, false),
            'trash' => $contract->update(['trash' => true]),
            'restore' => $contract->update(['trash' => false]),
        };

        return new ContractResource($this->loadForView($contract->refresh()));
    }

    public function copy(Contract $contract): ContractResource
    {
        $this->authorize('view', $contract);
        $this->authorize('create', Contract::class);

        return new ContractResource($this->loadForView($this->contracts->copy($contract)));
    }

    public function addComment(Request $request, Contract $contract): CommentResource
    {
        $this->authorize('view', $contract);
        $data = $request->validate(['content' => ['required', 'string', 'max:65000']]);

        return new CommentResource($contract->comments()->create(['user_id' => $request->user()->id, 'content' => $data['content']])->load('user'));
    }

    public function deleteComment(Request $request, ContractComment $contractComment): JsonResponse
    {
        abort_unless((int) $contractComment->user_id === (int) $request->user()->id || $request->user()->can('update', $contractComment->contract), 403);
        $contractComment->delete();

        return response()->json(['message' => 'Comment deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;

        return $request->validate([
            'subject' => ['required', 'string', 'max:300'],
            'description' => ['nullable', 'string', 'max:65000'],
            'content' => ['nullable', 'string', 'max:500000'],
            'customer_id' => ['required', 'integer', Rule::exists('customers', 'id')->where('company_id', $company)],
            'contract_type_id' => ['nullable', 'integer', Rule::exists('contract_types', 'id')->where('company_id', $company)],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('company_id', $company)->where('customer_id', $request->input('customer_id'))],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'contract_value' => ['nullable', 'numeric', 'min:0'],
            'trash' => ['boolean'],
            'not_visible_to_client' => ['boolean'],
        ]);
    }

    private function loadForView(Contract $contract): Contract
    {
        return $contract->load(['customer:id,name', 'type', 'project:id,name', 'renewals.renewer', 'comments.user', 'attachments.user']);
    }

    public function pdf(Request $request, Contract $contract): Response
    {
        $this->authorize('view', $contract);

        return SalesPdf::contract($contract, $request->boolean('inline'));
    }
}
