<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AccountDetailType;
use App\Models\AccountTransaction;
use App\Models\AccountTransfer;
use App\Models\JournalEntry;
use App\Support\CurrentCompany;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Perfex accounting: account types, the chart of accounts, postings to the ledger (journal
 * entries, transfers, opening balances) and the financial reports built from the ledger.
 */
class Accounting
{
    /**
     * Perfex account types: [name, group]. Assets and expenses have a debit balance;
     * liabilities, equity and income a credit balance.
     */
    public const TYPES = [
        1 => ['Accounts Receivable (A/R)', 'asset'],
        2 => ['Current assets', 'asset'],
        3 => ['Cash and cash equivalents', 'asset'],
        4 => ['Fixed assets', 'asset'],
        5 => ['Non-current assets', 'asset'],
        6 => ['Accounts Payable (A/P)', 'liability'],
        7 => ['Credit Card', 'liability'],
        8 => ['Current liabilities', 'liability'],
        9 => ['Non-current liabilities', 'liability'],
        10 => ["Owner's Equity", 'equity'],
        11 => ['Income', 'income'],
        12 => ['Other income', 'income'],
        13 => ['Cost of sales', 'expense'],
        14 => ['Expenses', 'expense'],
        15 => ['Other expense', 'expense'],
        16 => ['Bank', 'asset'],
    ];

    public static function debitNormal(int $typeId): bool
    {
        return in_array(self::TYPES[$typeId][1] ?? 'asset', ['asset', 'expense'], true);
    }

    /**
     * Create Perfex's detail types and default accounts for a company the first time.
     */
    public static function ensureChart(?int $companyId = null): void
    {
        $companyId ??= (int) CurrentCompany::id();
        if (AccountDetailType::withoutGlobalScopes()->where('company_id', $companyId)->exists()) {
            return;
        }

        DB::transaction(function () use ($companyId) {
            $detailIds = [];
            foreach (json_decode((string) file_get_contents(database_path('data/accounting_detail_types.json')), true) as $d) {
                $detailIds[$d['id']] = AccountDetailType::create(['company_id' => $companyId, 'account_type_id' => $d['account_type_id'], 'name' => $d['name'], 'system_id' => $d['id']])->id;
            }
            if (! Account::withoutGlobalScopes()->where('company_id', $companyId)->exists()) {
                foreach (json_decode((string) file_get_contents(database_path('data/accounting_default_accounts.json')), true) as $a) {
                    Account::create([
                        'company_id' => $companyId, 'key_name' => $a['key_name'], 'name' => $a['name'], 'account_type_id' => $a['account_type_id'],
                        'account_detail_type_id' => $detailIds[$a['account_detail_type_id']] ?? null,
                    ]);
                }
            }
        });
    }

    /**
     * A built-in account by its Perfex key (created if a company removed it).
     */
    public static function system(string $key, string $name, int $type, int $companyId): Account
    {
        return Account::withoutGlobalScopes()->firstOrCreate(['company_id' => $companyId, 'key_name' => $key], ['name' => $name, 'account_type_id' => $type]);
    }

    // Postings ------------------------------------------------------------------------------------

    /**
     * Post (or re-post) an account's opening balance against Opening Balance Equity.
     */
    public static function postOpeningBalance(Account $account): void
    {
        AccountTransaction::where('rel_type', 'opening_balance')->where('rel_id', $account->id)->delete();
        $amount = round((float) $account->balance, 2);
        if ($amount == 0.0) {
            return;
        }
        $equity = self::system('acc_opening_balance_equity', 'Opening Balance Equity', 10, (int) $account->company_id);
        $date = $account->balance_as_of ?? today();
        // A positive opening balance increases the account on its normal side.
        $debitSide = self::debitNormal($account->account_type_id) === ($amount > 0);
        foreach ([[$account, $debitSide], [$equity, ! $debitSide]] as [$acc, $isDebit]) {
            AccountTransaction::create([
                'company_id' => $account->company_id, 'account_id' => $acc->id, 'date' => $date,
                'debit' => $isDebit ? abs($amount) : 0, 'credit' => $isDebit ? 0 : abs($amount),
                'description' => "Opening balance - {$account->name}", 'rel_type' => 'opening_balance', 'rel_id' => $account->id, 'created_by' => Auth::id(),
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data  journal_date, reference, description, lines: [{account_id, debit, credit, description}]
     */
    public static function saveJournalEntry(array $data, ?JournalEntry $entry = null): JournalEntry
    {
        $lines = collect($data['lines'])->map(fn ($l) => [...$l, 'debit' => round((float) ($l['debit'] ?? 0), 2), 'credit' => round((float) ($l['credit'] ?? 0), 2)])
            ->filter(fn ($l) => $l['debit'] > 0 || $l['credit'] > 0)->values();
        $debits = round($lines->sum('debit'), 2);
        if ($lines->count() < 2 || $debits <= 0 || abs($debits - round($lines->sum('credit'), 2)) > 0.001) {
            throw ValidationException::withMessages(['lines' => 'Debits and credits must be equal (and not zero), with at least two lines.']);
        }
        if ($lines->contains(fn ($l) => $l['debit'] > 0 && $l['credit'] > 0)) {
            throw ValidationException::withMessages(['lines' => 'A line is either a debit or a credit, not both.']);
        }

        return DB::transaction(function () use ($data, $entry, $lines, $debits) {
            $fields = ['journal_date' => $data['journal_date'], 'reference' => $data['reference'] ?? null, 'description' => $data['description'] ?? null, 'amount' => $debits];
            if ($entry) {
                $entry->update($fields);
                AccountTransaction::where('rel_type', 'journal_entry')->where('rel_id', $entry->id)->delete();
            } else {
                $entry = JournalEntry::create([...$fields, 'number' => (int) JournalEntry::max('number') + 1, 'created_by' => Auth::id()]);
            }
            foreach ($lines as $l) {
                AccountTransaction::create([
                    'account_id' => $l['account_id'], 'date' => $entry->journal_date, 'debit' => $l['debit'], 'credit' => $l['credit'],
                    'description' => $l['description'] ?? $entry->description, 'rel_type' => 'journal_entry', 'rel_id' => $entry->id, 'created_by' => Auth::id(),
                ]);
            }

            return $entry;
        });
    }

    public static function deleteJournalEntry(JournalEntry $entry): void
    {
        DB::transaction(function () use ($entry) {
            AccountTransaction::where('rel_type', 'journal_entry')->where('rel_id', $entry->id)->delete();
            $entry->delete();
        });
    }

    /**
     * @param  array<string, mixed>  $data  from_account_id, to_account_id, amount, date, description
     */
    public static function transfer(array $data): AccountTransfer
    {
        return DB::transaction(function () use ($data) {
            $transfer = AccountTransfer::create([...$data, 'created_by' => Auth::id()]);
            $text = $data['description'] ?? 'Transfer';
            AccountTransaction::create(['account_id' => $data['from_account_id'], 'date' => $data['date'], 'credit' => $data['amount'], 'description' => $text, 'rel_type' => 'transfer', 'rel_id' => $transfer->id, 'created_by' => Auth::id()]);
            AccountTransaction::create(['account_id' => $data['to_account_id'], 'date' => $data['date'], 'debit' => $data['amount'], 'description' => $text, 'rel_type' => 'transfer', 'rel_id' => $transfer->id, 'created_by' => Auth::id()]);

            return $transfer;
        });
    }

    public static function deleteTransfer(AccountTransfer $transfer): void
    {
        DB::transaction(function () use ($transfer) {
            AccountTransaction::where('rel_type', 'transfer')->where('rel_id', $transfer->id)->delete();
            $transfer->delete();
        });
    }

    // Balances & reports --------------------------------------------------------------------------

    /**
     * Debit and credit totals per account (optionally between two dates).
     *
     * @return Collection<int, object{account_id: int, debit: float, credit: float}>
     */
    public static function totals(?CarbonInterface $from = null, ?CarbonInterface $to = null): Collection
    {
        return AccountTransaction::query()
            ->when($from, fn ($q) => $q->whereDate('date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('date', '<=', $to))
            ->selectRaw('account_id, SUM(debit) as debit, SUM(credit) as credit')
            ->groupBy('account_id')->get()->keyBy('account_id');
    }

    /**
     * An account's balance on its normal side.
     */
    public static function balanceOf(Account $account, ?object $totals): float
    {
        $debit = (float) ($totals->debit ?? 0);
        $credit = (float) ($totals->credit ?? 0);

        return round(self::debitNormal($account->account_type_id) ? $debit - $credit : $credit - $debit, 2);
    }

    /**
     * @return array<string, mixed>
     */
    public static function trialBalance(CarbonInterface $asOf): array
    {
        $totals = self::totals(null, $asOf);
        $rows = Account::orderBy('account_type_id')->orderBy('number')->orderBy('name')->get()
            ->map(function (Account $a) use ($totals) {
                $net = round((float) ($totals[$a->id]->debit ?? 0) - (float) ($totals[$a->id]->credit ?? 0), 2);

                return ['id' => $a->id, 'number' => $a->number, 'name' => $a->name, 'type' => self::TYPES[$a->account_type_id][0] ?? '', 'debit' => $net > 0 ? $net : 0, 'credit' => $net < 0 ? -$net : 0];
            })->filter(fn ($r) => $r['debit'] != 0 || $r['credit'] != 0)->values();

        return ['rows' => $rows, 'debit' => round($rows->sum('debit'), 2), 'credit' => round($rows->sum('credit'), 2)];
    }

    /**
     * Income and expense accounts for a period, grouped by account type.
     *
     * @return array<string, mixed>
     */
    public static function profitAndLoss(CarbonInterface $from, CarbonInterface $to): array
    {
        $totals = self::totals($from, $to);
        $section = function (array $typeIds) use ($totals) {
            $accounts = Account::whereIn('account_type_id', $typeIds)->orderBy('account_type_id')->orderBy('name')->get()
                ->map(fn (Account $a) => ['id' => $a->id, 'name' => $a->name, 'type_id' => $a->account_type_id, 'amount' => self::balanceOf($a, $totals[$a->id] ?? null)])
                ->filter(fn ($r) => $r['amount'] != 0)->values();

            return ['accounts' => $accounts, 'total' => round($accounts->sum('amount'), 2)];
        };
        $income = $section([11]);
        $costOfSales = $section([13]);
        $expenses = $section([14]);
        $otherIncome = $section([12]);
        $otherExpenses = $section([15]);
        $gross = round($income['total'] - $costOfSales['total'], 2);

        return [
            'income' => $income, 'cost_of_sales' => $costOfSales, 'gross_profit' => $gross, 'expenses' => $expenses,
            'net_operating_income' => round($gross - $expenses['total'], 2), 'other_income' => $otherIncome, 'other_expenses' => $otherExpenses,
            'net_income' => round($gross - $expenses['total'] + $otherIncome['total'] - $otherExpenses['total'], 2),
        ];
    }

    /**
     * Assets, liabilities and equity as of a date; this year's profit shows as Net Income and
     * earlier years' as Retained Earnings, as in Perfex.
     *
     * @return array<string, mixed>
     */
    public static function balanceSheet(CarbonInterface $asOf): array
    {
        $totals = self::totals(null, $asOf);
        $group = function (string $group) use ($totals) {
            $types = array_keys(array_filter(self::TYPES, fn ($t) => $t[1] === $group));
            $accounts = Account::whereIn('account_type_id', $types)->orderBy('account_type_id')->orderBy('name')->get()
                ->map(fn (Account $a) => ['id' => $a->id, 'name' => $a->name, 'type' => self::TYPES[$a->account_type_id][0], 'amount' => self::balanceOf($a, $totals[$a->id] ?? null)])
                ->filter(fn ($r) => $r['amount'] != 0)->values();

            return ['accounts' => $accounts, 'total' => round($accounts->sum('amount'), 2)];
        };
        $yearStart = $asOf->copy()->startOfYear();
        $netIncome = self::profitAndLoss($yearStart, $asOf)['net_income'];
        $before = self::profitAndLoss($yearStart->copy()->subYears(100), $yearStart->copy()->subDay())['net_income'];

        $assets = $group('asset');
        $liabilities = $group('liability');
        $equity = $group('equity');
        $equityTotal = round($equity['total'] + $netIncome + $before, 2);

        return [
            'assets' => $assets, 'liabilities' => $liabilities, 'equity' => $equity,
            'retained_earnings' => $before, 'net_income' => $netIncome, 'total_equity' => $equityTotal,
            'total_liabilities_and_equity' => round($liabilities['total'] + $equityTotal, 2),
        ];
    }
}
