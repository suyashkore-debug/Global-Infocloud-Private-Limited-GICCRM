<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CreditNoteRequest;
use App\Http\Resources\CreditNoteResource;
use App\Models\AppliedCredit;
use App\Models\CreditNote;
use App\Models\CreditNoteRefund;
use App\Models\Invoice;
use App\Services\CreditNoteService;
use App\Services\Options;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class CreditNoteController extends Controller
{
    public function __construct(private CreditNoteService $notes) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', CreditNote::class);

        $notes = CreditNote::query()
            ->visibleTo($request->user())
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->has('status'), fn (Builder $q) => $q->whereIn('status', array_map('intval', (array) $request->input('status'))))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->whereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$s}%"))
                ->orWhere('reference_no', 'like', "%{$s}%")))
            ->with(['customer:id,name', 'project:id,name', 'currency'])
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return CreditNoteResource::collection($notes);
    }

    public function defaults(): JsonResponse
    {
        $this->authorize('create', CreditNote::class);
        $date = today()->toDateString();

        return response()->json(['data' => [
            'next_number' => Options::formatNumber((int) Options::get('next_credit_note_number'), (int) Options::get('credit_note_number_format'), Options::get('credit_note_prefix'), $date),
            'date' => $date,
            'terms' => Options::get('predefined_terms_credit_note'),
            'client_note' => Options::get('predefined_clientnote_credit_note'),
        ]]);
    }

    public function store(CreditNoteRequest $request): CreditNoteResource
    {
        $this->authorize('create', CreditNote::class);

        return new CreditNoteResource($this->loadForView($this->notes->create($request->validated())));
    }

    public function show(CreditNote $creditNote): CreditNoteResource
    {
        $this->authorize('view', $creditNote);

        return new CreditNoteResource($this->loadForView($creditNote));
    }

    public function update(CreditNoteRequest $request, CreditNote $creditNote): CreditNoteResource
    {
        $this->authorize('update', $creditNote);

        return new CreditNoteResource($this->loadForView($this->notes->update($creditNote, $request->validated())));
    }

    public function destroy(CreditNote $creditNote): JsonResponse
    {
        $this->authorize('delete', $creditNote);

        if ($creditNote->appliedCredits()->exists()) {
            return response()->json(['message' => 'Remove the credits applied to invoices first.'], 422);
        }
        $creditNote->delete();
        Options::releaseNumber('next_credit_note_number', (int) $creditNote->number, (int) $creditNote->company_id);

        return response()->json(['message' => 'Credit note deleted.']);
    }

    public function creditableInvoices(CreditNote $creditNote): JsonResponse
    {
        $this->authorize('view', $creditNote);

        return response()->json(['data' => $this->notes->creditableInvoices($creditNote)->map(fn (Invoice $i) => [
            'id' => $i->id,
            'formatted_number' => $i->formattedNumber(),
            'date' => $i->date->toDateString(),
            'total' => $i->total,
            'amount_due' => $i->amountDue(),
        ])]);
    }

    public function apply(Request $request, CreditNote $creditNote): CreditNoteResource
    {
        $this->authorize('update', $creditNote);
        $data = $request->validate([
            'credits' => ['required', 'array', 'min:1'],
            'credits.*.invoice_id' => ['required', 'integer', Rule::exists('invoices', 'id')->where('company_id', $request->user()->company_id)],
            'credits.*.amount' => ['required', 'numeric', 'gt:0'],
        ]);

        foreach ($data['credits'] as $credit) {
            $this->notes->applyToInvoice($creditNote->refresh(), Invoice::findOrFail($credit['invoice_id']), (float) $credit['amount']);
        }

        return new CreditNoteResource($this->loadForView($creditNote->refresh()));
    }

    public function deleteAppliedCredit(AppliedCredit $appliedCredit): JsonResponse
    {
        $this->authorize('update', $appliedCredit->creditNote);
        $this->notes->deleteAppliedCredit($appliedCredit);

        return response()->json(['message' => 'Applied credit removed.']);
    }

    public function refund(Request $request, CreditNote $creditNote): CreditNoteResource
    {
        $this->authorize('update', $creditNote);
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'refunded_on' => ['required', 'date'],
            'payment_mode_id' => ['nullable', 'integer', Rule::exists('payment_modes', 'id')->where('company_id', $request->user()->company_id)],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);

        $this->notes->refund($creditNote, $data);

        return new CreditNoteResource($this->loadForView($creditNote->refresh()));
    }

    public function deleteRefund(CreditNoteRefund $refund): JsonResponse
    {
        $this->authorize('update', CreditNote::findOrFail($refund->credit_note_id));
        $this->notes->deleteRefund($refund);

        return response()->json(['message' => 'Refund deleted.']);
    }

    public function action(Request $request, CreditNote $creditNote): CreditNoteResource
    {
        $this->authorize('update', $creditNote);
        $action = $request->validate(['action' => ['required', Rule::in(['void', 'unvoid'])]])['action'];

        $action === 'void' ? $this->notes->void($creditNote) : $this->notes->unvoid($creditNote);

        return new CreditNoteResource($this->loadForView($creditNote->refresh()));
    }

    public function pdf(Request $request, CreditNote $creditNote): Response
    {
        $this->authorize('view', $creditNote);

        return SalesPdf::creditNote($creditNote, $request->boolean('inline'));
    }

    private function loadForView(CreditNote $note): CreditNote
    {
        return $note->load(['customer', 'project:id,name', 'currency', 'items.taxes', 'appliedCredits.invoice', 'refunds.paymentMode']);
    }
}
