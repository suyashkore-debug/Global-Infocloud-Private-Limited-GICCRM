<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExpenseResource;
use App\Http\Resources\InvoiceResource;
use App\Models\Expense;
use App\Models\Invoice;
use App\Services\ExpenseService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    public function __construct(private ExpenseService $expenses) {}

    /**
     * Perfex expenses list with its summary (total, billable, non billable, not invoiced, billed).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Expense::class);

        $base = Expense::query()
            ->visibleTo($request->user())
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->integer('category_id'), fn (Builder $q, int $id) => $q->where('expense_category_id', $id))
            ->when($request->date('from'), fn (Builder $q, $d) => $q->whereDate('date', '>=', $d))
            ->when($request->date('to'), fn (Builder $q, $d) => $q->whereDate('date', '<=', $d))
            ->when($request->input('filter') === 'billable', fn (Builder $q) => $q->where('billable', true))
            ->when($request->input('filter') === 'non_billable', fn (Builder $q) => $q->where('billable', false))
            ->when($request->input('filter') === 'invoiced', fn (Builder $q) => $q->whereNotNull('invoice_id'))
            ->when($request->input('filter') === 'unbilled', fn (Builder $q) => $q->where('billable', true)->whereNull('invoice_id'))
            ->when($request->input('filter') === 'recurring', fn (Builder $q) => $q->whereNotNull('repeat_every'))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->where('name', 'like', "%{$s}%")
                ->orWhere('reference_no', 'like', "%{$s}%")
                ->orWhereHas('category', fn (Builder $c) => $c->where('name', 'like', "%{$s}%"))
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', "%{$s}%"))));

        $all = (clone $base)->with(['tax', 'tax2'])->get();
        $sum = fn ($rows) => round($rows->sum(fn (Expense $e) => $e->totalWithTax()), 2);

        $expenses = $base->with(['category', 'customer:id,name', 'project:id,name', 'currency', 'tax', 'tax2', 'paymentMode', 'invoice'])
            ->latest('date')->latest('id')
            ->paginate($request->integer('per_page', 25));

        return ExpenseResource::collection($expenses)->additional(['meta' => ['summary' => [
            'total' => $sum($all),
            'billable' => $sum($all->where('billable', true)),
            'non_billable' => $sum($all->where('billable', false)),
            'not_invoiced' => $sum($all->where('billable', true)->whereNull('invoice_id')),
            'billed' => $sum($all->whereNotNull('invoice_id')),
        ]]]);
    }

    public function store(Request $request): ExpenseResource
    {
        $this->authorize('create', Expense::class);

        return new ExpenseResource($this->loadForView($this->expenses->create($this->validated($request))));
    }

    public function show(Expense $expense): ExpenseResource
    {
        $this->authorize('view', $expense);

        return new ExpenseResource($this->loadForView($expense));
    }

    public function update(Request $request, Expense $expense): ExpenseResource
    {
        $this->authorize('update', $expense);

        return new ExpenseResource($this->loadForView($this->expenses->update($expense, $this->validated($request))));
    }

    public function destroy(Expense $expense): JsonResponse
    {
        $this->authorize('delete', $expense);
        $expense->attachments()->get()->each->delete();
        $expense->delete();

        return response()->json(['message' => 'Expense deleted.']);
    }

    public function convertToInvoice(Request $request, Expense $expense): InvoiceResource
    {
        $this->authorize('update', $expense);
        $this->authorize('create', Invoice::class);

        return new InvoiceResource($this->expenses->convertToInvoice($expense, $request->boolean('draft'))->load(['customer', 'currency']));
    }

    public function copy(Expense $expense): ExpenseResource
    {
        $this->authorize('view', $expense);
        $this->authorize('create', Expense::class);

        return new ExpenseResource($this->loadForView($this->expenses->copy($expense)));
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;
        $in = fn (string $table) => Rule::exists($table, 'id')->where('company_id', $company);

        return $request->validate([
            'expense_category_id' => ['required', 'integer', $in('expense_categories')],
            'name' => ['nullable', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency_id' => ['nullable', 'integer', $in('currencies')],
            'tax_id' => ['nullable', 'integer', $in('taxes')],
            'tax2_id' => ['nullable', 'integer', $in('taxes')],
            'date' => ['required', 'date'],
            'customer_id' => ['nullable', 'integer', $in('customers')],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('company_id', $company)->where('customer_id', $request->input('customer_id'))],
            'billable' => ['boolean'],
            'payment_mode_id' => ['nullable', 'integer', $in('payment_modes')],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:65000'],
            'repeat_every' => ['nullable', 'integer', 'min:1', 'max:365'],
            'recurring_type' => ['nullable', 'required_with:repeat_every', Rule::in(['day', 'week', 'month', 'year'])],
            'cycles' => ['nullable', 'integer', 'min:0'],
            'create_invoice_billable' => ['boolean'],
        ]);
    }

    private function loadForView(Expense $expense): Expense
    {
        return $expense->load(['category', 'customer:id,name', 'project:id,name', 'currency', 'tax', 'tax2', 'paymentMode', 'invoice', 'attachments.user']);
    }
}
