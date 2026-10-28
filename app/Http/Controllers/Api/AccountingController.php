<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\AccountDetailType;
use App\Models\AccountTransaction;
use App\Models\AccountTransfer;
use App\Models\JournalEntry;
use App\Models\User;
use App\Services\Accounting;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Perfex accounting: chart of accounts, account history, journal entries, transfers and the
 * financial reports (trial balance, profit & loss, balance sheet, general ledger, journal).
 */
class AccountingController extends Controller
{
    // Chart of accounts ---------------------------------------------------------------------------

    public function accounts(Request $request): JsonResponse
    {
        $this->allow($request, 'view');
        Accounting::ensureChart();
        $totals = Accounting::totals(null, CarbonImmutable::today());
        $accounts = Account::with(['detailType:id,name', 'parent:id,name'])
            ->when($request->integer('type'), fn ($q, $t) => $q->where('account_type_id', $t))
            ->when($request->filled('active'), fn ($q) => $q->where('active', $request->boolean('active')))
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('number', 'like', "%{$s}%")))
            ->orderBy('account_type_id')->orderBy('number')->orderBy('name')->get();

        return response()->json([
            'data' => $accounts->map(fn (Account $a) => [
                ...$a->only(['id', 'key_name', 'number', 'name', 'parent_id', 'account_type_id', 'account_detail_type_id', 'description', 'active', 'bank_account', 'bank_name']),
                'opening_balance' => $a->balance !== null ? (float) $a->balance : null,
                'balance_as_of' => $a->balance_as_of?->toDateString(),
                'type' => Accounting::TYPES[$a->account_type_id][0] ?? '',
                'detail_type' => $a->detailType?->name,
                'parent' => $a->parent?->name,
                'balance' => Accounting::balanceOf($a, $totals[$a->id] ?? null),
                'has_transactions' => isset($totals[$a->id]),
            ]),
            'meta' => [
                'types' => collect(Accounting::TYPES)->map(fn ($t, $id) => ['id' => $id, 'name' => $t[0], 'group' => $t[1]])->values(),
                'detail_types' => AccountDetailType::orderBy('account_type_id')->orderBy('name')->get(['id', 'account_type_id', 'name']),
            ],
        ]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $account = DB::transaction(function () use ($request) {
            $account = Account::create([...$this->validatedAccount($request), 'created_by' => $request->user()->id]);
            Accounting::postOpeningBalance($account);

            return $account;
        });

        return response()->json(['data' => $account], 201);
    }

    public function updateAccount(Request $request, Account $account): JsonResponse
    {
        $this->allow($request, 'edit');
        DB::transaction(function () use ($request, $account) {
            $account->update($this->validatedAccount($request, $account));
            Accounting::postOpeningBalance($account);
        });

        return response()->json(['data' => $account]);
    }

    public function destroyAccount(Request $request, Account $account): JsonResponse
    {
        $this->allow($request, 'delete');
        abort_if($account->key_name === 'acc_opening_balance_equity', 422, 'Opening Balance Equity is needed for opening balances.');
        abort_if(AccountTransaction::where('account_id', $account->id)->where('rel_type', '!=', 'opening_balance')->exists(), 422, 'This account has transactions; mark it inactive instead.');
        abort_if($account->children()->exists(), 422, 'Move or delete the sub-accounts first.');
        DB::transaction(function () use ($account) {
            AccountTransaction::where('rel_type', 'opening_balance')->where('rel_id', $account->id)->delete();
            $account->delete();
        });

        return response()->json(['message' => 'Account deleted.']);
    }

    public function storeDetailType(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $data = $request->validate([
            'account_type_id' => ['required', Rule::in(array_keys(Accounting::TYPES))],
            'name' => ['required', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        return response()->json(['data' => AccountDetailType::create($data)], 201);
    }

    /**
     * An account's ledger for a period with the running balance (Perfex "Account history").
     */
    public function history(Request $request, Account $account): JsonResponse
    {
        $this->allow($request, 'view');
        [$from, $to] = $this->period($request);
        $before = Accounting::balanceOf($account, Accounting::totals(null, $from->subDay())[$account->id] ?? null);
        $balance = $before;
        $debitNormal = Accounting::debitNormal($account->account_type_id);
        $rows = AccountTransaction::where('account_id', $account->id)->whereBetween('date', [$from->toDateString(), $to->toDateString()])->orderBy('date')->orderBy('id')->get()
            ->map(function (AccountTransaction $t) use (&$balance, $debitNormal) {
                $balance = round($balance + ($debitNormal ? $t->debit - $t->credit : $t->credit - $t->debit), 2);

                return ['id' => $t->id, 'date' => $t->date->toDateString(), 'description' => $t->description, 'rel_type' => $t->rel_type, 'rel_id' => $t->rel_id,
                    'debit' => (float) $t->debit, 'credit' => (float) $t->credit, 'balance' => $balance];
            });

        return response()->json(['data' => ['account' => $account->only(['id', 'name', 'number', 'account_type_id']), 'opening' => $before, 'rows' => $rows, 'closing' => $balance]]);
    }

    // Journal entries -----------------------------------------------------------------------------

    public function journalEntries(Request $request): JsonResponse
    {
        $this->allow($request, 'view');
        $page = JournalEntry::withCount('lines')
            ->when($request->date('from'), fn ($q, $d) => $q->whereDate('journal_date', '>=', $d))
            ->when($request->date('to'), fn ($q, $d) => $q->whereDate('journal_date', '<=', $d))
            ->orderByDesc('journal_date')->orderByDesc('id')->paginate(25);
        $names = User::whereIn('id', collect($page->items())->pluck('created_by')->unique())->pluck('full_name', 'id');

        return response()->json([
            'data' => collect($page->items())->map(fn (JournalEntry $j) => [
                ...$j->only(['id', 'number', 'reference', 'description', 'lines_count']), 'journal_date' => $j->journal_date->toDateString(),
                'amount' => (float) $j->amount, 'created_by' => $names[$j->created_by] ?? null,
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function journalEntry(Request $request, JournalEntry $journalEntry): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => $this->entry($journalEntry)]);
    }

    public function saveJournalEntry(Request $request, ?JournalEntry $journalEntry = null): JsonResponse
    {
        $this->allow($request, $journalEntry ? 'edit' : 'create');
        $company = $request->user()->company_id;
        $data = $request->validate([
            'journal_date' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:5000'],
            'lines' => ['required', 'array', 'min:2', 'max:200'],
            'lines.*.account_id' => ['required', 'integer', Rule::exists('accounts', 'id')->where('company_id', $company)],
            'lines.*.debit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.credit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.description' => ['nullable', 'string', 'max:1000'],
        ]);
        $entry = Accounting::saveJournalEntry($data, $journalEntry);

        return response()->json(['data' => $this->entry($entry)], $journalEntry ? 200 : 201);
    }

    public function destroyJournalEntry(Request $request, JournalEntry $journalEntry): JsonResponse
    {
        $this->allow($request, 'delete');
        Accounting::deleteJournalEntry($journalEntry);

        return response()->json(['message' => 'Journal entry deleted.']);
    }

    // Transfers -----------------------------------------------------------------------------------

    public function transfers(Request $request): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => AccountTransfer::with(['from:id,name', 'to:id,name'])->orderByDesc('date')->orderByDesc('id')->limit(500)->get()
            ->map(fn (AccountTransfer $t) => ['id' => $t->id, 'date' => $t->date->toDateString(), 'from' => $t->from?->name, 'to' => $t->to?->name, 'amount' => (float) $t->amount, 'description' => $t->description])]);
    }

    public function storeTransfer(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $company = $request->user()->company_id;
        $data = $request->validate([
            'from_account_id' => ['required', 'integer', Rule::exists('accounts', 'id')->where('company_id', $company)],
            'to_account_id' => ['required', 'integer', 'different:from_account_id', Rule::exists('accounts', 'id')->where('company_id', $company)],
            'amount' => ['required', 'numeric', 'gt:0'],
            'date' => ['required', 'date'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        return response()->json(['data' => Accounting::transfer($data)], 201);
    }

    public function destroyTransfer(Request $request, AccountTransfer $transfer): JsonResponse
    {
        $this->allow($request, 'delete');
        Accounting::deleteTransfer($transfer);

        return response()->json(['message' => 'Transfer deleted.']);
    }

    // Reports -------------------------------------------------------------------------------------

    public function report(Request $request, string $report): JsonResponse
    {
        $this->allow($request, 'view');
        Accounting::ensureChart();
        [$from, $to] = $this->period($request);

        $data = match ($report) {
            'trial-balance' => Accounting::trialBalance($to),
            'profit-and-loss' => Accounting::profitAndLoss($from, $to),
            'balance-sheet' => Accounting::balanceSheet($to),
            'general-ledger' => $this->generalLedger($request, $from, $to),
            'journal' => JournalEntry::whereBetween('journal_date', [$from->toDateString(), $to->toDateString()])->orderBy('journal_date')->orderBy('id')->get()->map(fn ($j) => $this->entry($j)),
            default => abort(404),
        };

        return response()->json(['data' => $data, 'meta' => ['from' => $from->toDateString(), 'to' => $to->toDateString()]]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function generalLedger(Request $request, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $opening = Accounting::totals(null, $from->subDay());
        $rows = AccountTransaction::whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->when($request->integer('account_id'), fn ($q, $a) => $q->where('account_id', $a))
            ->orderBy('date')->orderBy('id')->get()->groupBy('account_id');

        return Account::whereIn('id', $rows->keys())->orderBy('account_type_id')->orderBy('name')->get()->map(function (Account $a) use ($rows, $opening) {
            $balance = Accounting::balanceOf($a, $opening[$a->id] ?? null);
            $start = $balance;
            $debitNormal = Accounting::debitNormal($a->account_type_id);
            $lines = $rows[$a->id]->map(function ($t) use (&$balance, $debitNormal) {
                $balance = round($balance + ($debitNormal ? $t->debit - $t->credit : $t->credit - $t->debit), 2);

                return ['date' => $t->date->toDateString(), 'description' => $t->description, 'rel_type' => $t->rel_type, 'rel_id' => $t->rel_id, 'debit' => (float) $t->debit, 'credit' => (float) $t->credit, 'balance' => $balance];
            })->values();

            return ['account' => $a->only(['id', 'name', 'number']), 'opening' => $start, 'lines' => $lines, 'closing' => $balance];
        })->values()->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function entry(JournalEntry $j): array
    {
        $j->load('lines.account:id,name,number');

        return [
            ...$j->only(['id', 'number', 'reference', 'description']), 'journal_date' => $j->journal_date->toDateString(), 'amount' => (float) $j->amount,
            'lines' => $j->lines->map(fn ($l) => ['account_id' => $l->account_id, 'account' => $l->account?->name, 'debit' => (float) $l->debit, 'credit' => (float) $l->credit, 'description' => $l->description]),
        ];
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function period(Request $request): array
    {
        $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date'], 'as_of' => ['nullable', 'date']]);
        $to = CarbonImmutable::parse($request->input('to', $request->input('as_of', today()->toDateString())));
        $from = CarbonImmutable::parse($request->input('from', $to->startOfYear()->toDateString()));

        return [$from, $to];
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedAccount(Request $request, ?Account $account = null): array
    {
        $company = $request->user()->company_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'number' => ['nullable', 'string', 'max:45'],
            'account_type_id' => ['required', Rule::in(array_keys(Accounting::TYPES))],
            'account_detail_type_id' => ['nullable', 'integer', Rule::exists('account_detail_types', 'id')->where('company_id', $company)],
            'parent_id' => ['nullable', 'integer', Rule::exists('accounts', 'id')->where('company_id', $company)->whereNot('id', $account?->id ?? 0)],
            'description' => ['nullable', 'string', 'max:5000'],
            'balance' => ['nullable', 'numeric'],
            'balance_as_of' => ['nullable', 'date', 'required_with:balance'],
            'active' => ['boolean'],
            'bank_account' => ['nullable', 'string', 'max:191'],
            'bank_name' => ['nullable', 'string', 'max:191'],
        ]);
        if (! empty($data['parent_id']) && (int) Account::find($data['parent_id'])?->account_type_id !== (int) $data['account_type_id']) {
            abort(response()->json(['message' => 'A sub-account must have the same account type as its parent.', 'errors' => ['parent_id' => ['A sub-account must have the same account type as its parent.']]], 422));
        }

        return $data;
    }

    private function allow(Request $request, string $capability): void
    {
        abort_unless($request->user()->hasPermission('accounting', $capability), 403);
    }
}
