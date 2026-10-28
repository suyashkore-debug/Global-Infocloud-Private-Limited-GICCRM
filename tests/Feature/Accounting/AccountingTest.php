<?php

use App\Models\Account;

function acc(string $key): int
{
    return Account::where('key_name', $key)->value('id');
}

it('creates Perfex\'s chart of accounts and posts opening balances against equity', function () {
    signIn(companyAdmin());
    $data = $this->getJson('/api/accounting/accounts')->assertOk()->json();
    expect(count($data['data']))->toBe(88)->and(count($data['meta']['detail_types']))->toBe(139)->and(count($data['meta']['types']))->toBe(16);

    $bank = $this->postJson('/api/accounting/accounts', ['name' => 'ICICI Bank', 'account_type_id' => 16, 'balance' => 100000, 'balance_as_of' => '2026-04-01'])->assertCreated()->json('data.id');
    $accounts = collect($this->getJson('/api/accounting/accounts')->json('data'))->keyBy('id');
    expect($accounts[$bank]['balance'])->toEqual(100000)->and($accounts[acc('acc_opening_balance_equity')]['balance'])->toEqual(100000);

    $this->deleteJson('/api/accounting/accounts/'.acc('acc_opening_balance_equity'))->assertUnprocessable();
});

it('only saves balanced journal entries and reports profit, trial balance and a balancing balance sheet', function () {
    signIn(companyAdmin());
    $this->getJson('/api/accounting/accounts');
    $bank = $this->postJson('/api/accounting/accounts', ['name' => 'Bank', 'account_type_id' => 16])->json('data.id');
    $income = $this->postJson('/api/accounting/accounts', ['name' => 'Consulting income', 'account_type_id' => 11])->json('data.id');
    $rent = $this->postJson('/api/accounting/accounts', ['name' => 'Office rent', 'account_type_id' => 14])->json('data.id');

    $this->postJson('/api/accounting/journal-entries', ['journal_date' => '2026-05-01', 'lines' => [
        ['account_id' => $bank, 'debit' => 50000], ['account_id' => $income, 'credit' => 40000],
    ]])->assertJsonValidationErrors('lines');

    $this->postJson('/api/accounting/journal-entries', ['journal_date' => '2026-05-01', 'description' => 'Fees received', 'lines' => [
        ['account_id' => $bank, 'debit' => 50000], ['account_id' => $income, 'credit' => 50000],
    ]])->assertCreated()->assertJsonPath('data.amount', 50000)->assertJsonPath('data.number', 1);
    $rentEntry = $this->postJson('/api/accounting/journal-entries', ['journal_date' => '2026-05-05', 'lines' => [
        ['account_id' => $rent, 'debit' => 15000], ['account_id' => $bank, 'credit' => 15000],
    ]])->assertCreated()->json('data.id');

    $this->getJson('/api/accounting/reports/profit-and-loss?from=2026-01-01&to=2026-12-31')
        ->assertJsonPath('data.income.total', 50000)->assertJsonPath('data.expenses.total', 15000)->assertJsonPath('data.net_income', 35000);
    $this->getJson('/api/accounting/reports/trial-balance?as_of=2026-12-31')->assertJsonPath('data.debit', 50000)->assertJsonPath('data.credit', 50000);
    $sheet = $this->getJson('/api/accounting/reports/balance-sheet?as_of=2026-12-31')->json('data');
    expect($sheet['assets']['total'])->toEqual(35000)->and($sheet['total_liabilities_and_equity'])->toEqual(35000)->and($sheet['net_income'])->toEqual(35000);

    $history = $this->getJson("/api/accounting/accounts/{$bank}/history?from=2026-01-01&to=2026-12-31")->json('data');
    expect($history['closing'])->toEqual(35000)->and($history['rows'])->toHaveCount(2);
    $this->getJson('/api/accounting/reports/general-ledger?from=2026-01-01&to=2026-12-31')->assertJsonCount(3, 'data');

    $this->deleteJson("/api/accounting/accounts/{$rent}")->assertUnprocessable();
    $this->deleteJson("/api/accounting/journal-entries/{$rentEntry}")->assertOk();
    $this->getJson('/api/accounting/reports/profit-and-loss?from=2026-01-01&to=2026-12-31')->assertJsonPath('data.net_income', 50000);
});

it('transfers between accounts and keeps accounting behind its permission', function () {
    $admin = signIn(companyAdmin());
    $this->getJson('/api/accounting/accounts');
    $a = $this->postJson('/api/accounting/accounts', ['name' => 'ICICI', 'account_type_id' => 16, 'balance' => 1000, 'balance_as_of' => '2026-01-01'])->json('data.id');
    $b = $this->postJson('/api/accounting/accounts', ['name' => 'Cash', 'account_type_id' => 3])->json('data.id');
    $this->postJson('/api/accounting/transfers', ['from_account_id' => $a, 'to_account_id' => $a, 'amount' => 10, 'date' => '2026-02-01'])->assertJsonValidationErrors('to_account_id');
    $t = $this->postJson('/api/accounting/transfers', ['from_account_id' => $a, 'to_account_id' => $b, 'amount' => 300, 'date' => '2026-02-01'])->assertCreated()->json('data.id');
    $balances = collect($this->getJson('/api/accounting/accounts')->json('data'))->pluck('balance', 'id');
    expect($balances[$a])->toEqual(700)->and($balances[$b])->toEqual(300);
    $this->deleteJson("/api/accounting/transfers/{$t}")->assertOk();

    signIn(staffMember($admin->company));
    $this->getJson('/api/accounting/accounts')->assertForbidden();
    signIn(staffMember($admin->company, ['accounting.view']));
    $this->getJson('/api/accounting/reports/balance-sheet')->assertOk();
    $this->postJson('/api/accounting/transfers', ['from_account_id' => $a, 'to_account_id' => $b, 'amount' => 1, 'date' => '2026-02-01'])->assertForbidden();
});
