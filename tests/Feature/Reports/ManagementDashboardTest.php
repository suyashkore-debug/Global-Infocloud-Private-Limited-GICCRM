<?php

use App\Models\Customer;
use App\Models\Invoice;
use Illuminate\Support\Carbon;

it('gives report viewers the period figures and ages unpaid invoices', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Acme']);
    $today = Carbon::today('Asia/Kolkata');
    $late = Invoice::factory()->for($customer)->create(['date' => $today->copy()->subDays(60), 'due_date' => $today->copy()->subDays(45), 'status' => 1, 'total' => 1000]);
    Invoice::factory()->for($customer)->create(['date' => $today, 'due_date' => $today->copy()->addDays(10), 'status' => 1, 'total' => 500]);

    $data = $this->getJson('/api/reports/management?period=year')->assertOk()->json('data');
    expect($data['cash']['months'])->toHaveCount(12)
        ->and($data['kpis']['invoiced'])->toEqual(1500)
        ->and($data['kpis']['outstanding'])->toEqual(1500)
        ->and(collect($data['aging'])->firstWhere('label', '31–60 days late')['amount'])->toEqual(1000)
        ->and(collect($data['aging'])->firstWhere('label', 'Not due yet')['amount'])->toEqual(500);

    expect($this->getJson('/api/reports/management?period=month')->json('data.cash.months'))->toHaveCount(1);
    $this->getJson('/api/reports/management?period=fy')->assertOk()->assertJsonPath('data.period.from', Carbon::create($today->month >= 4 ? $today->year : $today->year - 1, 4, 1)->toDateString());
    $this->getJson('/api/reports/management?period=week')->assertJsonValidationErrors('period');

    signIn(staffMember($admin->company));
    $this->getJson('/api/reports/management')->assertForbidden();
});
