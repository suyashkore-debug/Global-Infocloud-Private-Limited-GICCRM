<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\AccountDetailType;
use App\Models\AccountTransaction;
use App\Services\Accounting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Import GIC's chart of accounts from the old Perfex accounting module (GICHRMS): built-in and
 * own accounts with numbers, sub-accounts, active flags, opening balances and the company's own
 * detail types. The old journal entries have no lines in GICHRMS (no account history), so they
 * are listed but not imported.
 */
class ImportGichrmsAccounting extends Command
{
    protected $signature = 'accounting:import-gichrms {dir : folder with the JSON exports} {--company= : company id} {--dry-run : roll back at the end}';

    protected $description = 'Import the chart of accounts from GICHRMS (old Perfex) into a company';

    public function handle(): int
    {
        $company = (int) $this->option('company');
        if (! $company) {
            $this->error('Pass --company=ID');

            return self::FAILURE;
        }
        if (AccountTransaction::withoutGlobalScopes()->where('company_id', $company)->where('rel_type', '!=', 'opening_balance')->exists()) {
            $this->error('This company already has accounting transactions; the chart is not replaced.');

            return self::FAILURE;
        }
        $dir = rtrim((string) $this->argument('dir'), '/');
        $read = fn (string $t) => json_decode((string) file_get_contents("{$dir}/{$t}.json"), true, 512, JSON_THROW_ON_ERROR);

        DB::beginTransaction();
        try {
            // Start from a clean chart: Perfex's detail types, then GIC's accounts.
            Account::withoutGlobalScopes()->where('company_id', $company)->update(['parent_id' => null]);
            AccountTransaction::withoutGlobalScopes()->where('company_id', $company)->delete();
            Account::withoutGlobalScopes()->where('company_id', $company)->delete();
            Accounting::ensureChart($company);
            Account::withoutGlobalScopes()->where('company_id', $company)->delete(); // keep detail types, use GIC's accounts

            $detail = AccountDetailType::withoutGlobalScopes()->where('company_id', $company)->whereNotNull('system_id')->pluck('id', 'system_id')->all();
            foreach ($read('tblacc_account_type_details') as $d) {
                $detail[(int) $d['id']] = AccountDetailType::create([
                    'company_id' => $company, 'account_type_id' => (int) $d['account_type_id'], 'name' => trim((string) $d['name']), 'note' => strip_tags((string) $d['note']) ?: null,
                ])->id;
            }

            $defaults = collect(json_decode((string) file_get_contents(database_path('data/accounting_default_accounts.json')), true))->pluck('name', 'key_name');
            $map = [];
            $rows = $read('tblacc_accounts');
            foreach ($rows as $a) {
                $name = trim((string) $a['name']) ?: ($defaults[$a['key_name']] ?? $a['key_name'] ?? 'Account #'.$a['id']);
                $map[(int) $a['id']] = Account::create([
                    'company_id' => $company,
                    'key_name' => $a['key_name'] ?: null,
                    'number' => $a['number'] ?: null,
                    'name' => $name,
                    'account_type_id' => (int) $a['account_type_id'],
                    'account_detail_type_id' => $detail[(int) $a['account_detail_type_id']] ?? null,
                    'description' => trim(strip_tags((string) $a['description'])) ?: null,
                    'balance' => $a['balance'] !== null && (float) $a['balance'] != 0 ? $a['balance'] : null,
                    'balance_as_of' => $a['balance'] !== null && (float) $a['balance'] != 0 ? ($a['balance_as_of'] ?: today()->toDateString()) : null,
                    'active' => (bool) $a['active'],
                    'bank_account' => $a['bank_account'] ?: null,
                    'bank_name' => $a['bank_name'] ?: null,
                ])->id;
            }
            foreach ($rows as $a) {
                if ($a['parent_account'] && isset($map[(int) $a['parent_account']])) {
                    Account::withoutGlobalScopes()->whereKey($map[(int) $a['id']])->update(['parent_id' => $map[(int) $a['parent_account']]]);
                }
            }
            foreach (Account::withoutGlobalScopes()->where('company_id', $company)->whereNotNull('balance')->get() as $account) {
                Accounting::postOpeningBalance($account);
                $this->line("  opening balance {$account->name}: ".number_format((float) $account->balance, 2).' as of '.$account->balance_as_of?->toDateString());
            }

            $this->info(sprintf('  %d accounts (%d built-in, %d own), %d own detail types', count($map),
                collect($rows)->filter(fn ($a) => $a['key_name'])->count(), collect($rows)->reject(fn ($a) => $a['key_name'])->count(), count($read('tblacc_account_type_details'))));
            $entries = $read('tblacc_journal_entries');
            $this->warn(sprintf('  %d journal entries in GICHRMS have no debit/credit lines (no account history there), so they were not imported.', count($entries)));

            if ($this->option('dry-run')) {
                DB::rollBack();
                $this->warn('Dry run: rolled back.');
            } else {
                DB::commit();
                $this->info('Import finished.');
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Import failed, nothing was saved: '.$e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
