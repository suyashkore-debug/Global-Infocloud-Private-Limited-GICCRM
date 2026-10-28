<?php

use App\Models\Company;
use App\Models\Customer;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Carbon;

/**
 * The CSV rows of a streamed export (without the UTF-8 marker).
 */
function csvRows($response): array
{
    $body = $response->streamedContent();
    expect(str_starts_with($body, "\xEF\xBB\xBF"))->toBeTrue();

    return array_map('str_getcsv', array_filter(explode("\n", substr($body, 3))));
}

it('exports customers with their custom fields for a period', function () {
    $admin = signIn(companyAdmin());
    $field = $this->postJson('/api/custom-fields', ['field_to' => 'customers', 'name' => 'Industry', 'type' => 'input'])->json('data.id');
    $old = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Old Co', 'created_at' => '2024-06-01']);
    $new = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'मराठी Traders', 'city' => 'पुणे']);
    $this->putJson("/api/custom-field-values/customers/{$new->id}", ['custom_fields' => [$field => 'ERP']])->assertOk();
    Customer::factory()->create(['name' => 'Other company', 'company_id' => Company::factory()->create()->id]);

    $all = csvRows($this->get('/api/exports/customers')->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8'));
    expect($all[0])->toContain('Company')->toContain('Industry')
        ->and(array_column(array_slice($all, 1), 1))->toEqualCanonicalizing(['Old Co', 'मराठी Traders']);

    $thisYear = csvRows($this->get('/api/exports/customers?period=this_year'));
    expect($thisYear)->toHaveCount(2)->and($thisYear[1][1])->toBe('मराठी Traders')->and($thisYear[1][7])->toBe('पुणे')->and(end($thisYear[1]))->toBe('ERP');

    $custom = csvRows($this->get('/api/exports/customers?period=custom&from=2024-05-01&to=2024-06-30'));
    expect($custom)->toHaveCount(2)->and($custom[1][1])->toBe('Old Co');
    $this->getJson('/api/exports/customers?period=custom')->assertJsonValidationErrors(['from', 'to']);
});

it('only offers and runs the exports a person may see', function () {
    Carbon::setTestNow('2026-10-21 10:00:00');
    $admin = companyAdmin();
    $dev = staffMember($admin->company);
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $task = Task::factory()->for($project)->create(['name' => 'Build API']);
    $task->assignees()->create(['user_id' => $dev->id]);
    $task->timers()->create(['user_id' => $dev->id, 'start_time' => '2026-10-20 04:00:00', 'end_time' => '2026-10-20 05:30:00']);
    $task->timers()->create(['user_id' => $admin->id, 'start_time' => '2026-10-20 06:00:00', 'end_time' => '2026-10-20 07:00:00']);

    signIn($dev);
    $types = collect($this->getJson('/api/exports')->json('data'))->pluck('type');
    expect($types)->toContain('tasks')->toContain('timesheets')->not->toContain('customers')->not->toContain('invoices');
    $this->get('/api/exports/customers')->assertForbidden();
    $this->get('/api/exports/payroll')->assertNotFound();
    $sheets = csvRows($this->get('/api/exports/timesheets'));
    expect($sheets)->toHaveCount(2)->and($sheets[1][1])->toBe('Build API')->and($sheets[1][5])->toBe('1.5')->and($sheets[1][3])->toBe('2026-10-20 09:30');

    signIn($admin);
    expect(csvRows($this->get('/api/exports/timesheets')))->toHaveCount(3)
        ->and(csvRows($this->get('/api/exports/tasks'))[1])->toContain('Build API');
});
