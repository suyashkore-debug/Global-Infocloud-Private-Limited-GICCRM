<?php

use App\Models\ActivityLog;
use App\Models\AppNotification;
use App\Models\ContractType;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\GoalService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('lets everyone read the knowledge base, editors write it, and records votes and views', function () {
    $admin = signIn(companyAdmin());
    $group = $this->postJson('/api/kb/groups', ['name' => 'Getting started'])->assertCreated()->json('data.id');
    $article = $this->postJson('/api/kb/articles', ['subject' => 'How to log in', 'kb_group_id' => $group, 'description' => 'Use your HRMS password'])
        ->assertCreated()->assertJsonPath('data.slug', 'how-to-log-in')->json('data.id');

    $staff = signIn(staffMember($admin->company));
    $this->postJson('/api/kb/articles', ['subject' => 'x', 'kb_group_id' => $group])->assertForbidden();
    $this->getJson('/api/kb?search=log')->assertOk()->assertJsonPath('data.0.articles.0.subject', 'How to log in');
    $this->postJson("/api/kb/articles/{$article}/vote", ['helpful' => true])->assertOk();
    $this->getJson("/api/kb/articles/{$article}")->assertJsonPath('data.helpful_count', 1)->assertJsonPath('data.views', 1)->assertJsonPath('data.my_vote', true);
});

it('shows announcements to staff until they dismiss them', function () {
    $admin = signIn(companyAdmin());
    $staff = staffMember($admin->company);
    $id = $this->postJson('/api/announcements', ['name' => 'Diwali holiday', 'message' => 'Office closed', 'show_to_staff' => true])->assertCreated()->json('data.id');
    expect(AppNotification::where('user_id', $staff->id)->count())->toBe(1);

    signIn($staff);
    $this->postJson('/api/announcements', ['name' => 'x', 'message' => 'y'])->assertForbidden();
    $this->getJson('/api/announcements?active=1')->assertJsonCount(1, 'data');
    $this->postJson("/api/announcements/{$id}/dismiss")->assertOk();
    $this->getJson('/api/announcements?active=1')->assertJsonCount(0, 'data');
});

it('puts own and public events, due tasks and invoices on the calendar, but not others\' private events', function () {
    $admin = signIn(companyAdmin());
    $other = staffMember($admin->company);
    $invoice = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id, 'due_date' => '2026-11-10']);

    $this->postJson('/api/calendar/events', ['title' => 'Client meeting', 'start' => '2026-11-05 10:00'])->assertCreated();
    signIn($other);
    $this->postJson('/api/calendar/events', ['title' => 'Private', 'start' => '2026-11-06 10:00'])->assertCreated();
    $this->postJson('/api/calendar/events', ['title' => 'Team lunch', 'start' => '2026-11-07 13:00', 'public' => true])->assertCreated();

    signIn($admin);
    $titles = collect($this->getJson('/api/calendar?start=2026-11-01&end=2026-11-30')->assertOk()->json('data'))->pluck('title');
    expect($titles)->toContain('Client meeting', 'Team lunch', 'Invoice due: '.$invoice->formattedNumber())->not->toContain('Private');
});

it('logs created and deleted records in the activity log, visible to admins only', function () {
    $admin = signIn(companyAdmin());
    $id = $this->postJson('/api/customers', ['name' => 'Logged Co'])->json('data.id');
    $this->deleteJson("/api/customers/{$id}");

    expect(ActivityLog::pluck('description')->all())->toContain("New Customer Created [ID: {$id}, Logged Co]", "Customer Deleted [ID: {$id}, Logged Co]");
    $this->getJson('/api/activity-log')->assertOk()->assertJsonPath('data.0.user', $admin->full_name);

    signIn(staffMember($admin->company));
    $this->getJson('/api/activity-log')->assertForbidden();
});

it('stores media in folders and lets only the uploader or an admin delete it', function () {
    Storage::fake('local');
    $admin = signIn(companyAdmin());
    $staff = staffMember($admin->company);

    signIn($staff);
    $this->post('/api/media', ['folder' => 'brand', 'files' => [UploadedFile::fake()->image('logo.png')]], ['Accept' => 'application/json'])->assertCreated();
    $this->getJson('/api/media')->assertJsonPath('folders', ['brand']);
    $id = $this->getJson('/api/media?folder=brand')->assertJsonPath('data.0.is_image', true)->json('data.0.id');

    signIn(staffMember($admin->company));
    $this->deleteJson("/api/media/{$id}")->assertForbidden();
    signIn($admin);
    $this->deleteJson("/api/media/{$id}")->assertOk();
});

it('computes goal progress from payments and notifies once the goal ends', function () {
    $admin = signIn(companyAdmin());
    $invoice = Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id, 'total' => 10000]);
    Payment::create(['company_id' => $admin->company_id, 'invoice_id' => $invoice->id, 'amount' => 2500, 'date' => '2026-03-10', 'created_by' => $admin->id]);

    $this->postJson('/api/goals', ['subject' => 'Q1 income', 'goal_type' => 1, 'achievement' => 10000, 'start_date' => '2026-01-01', 'end_date' => '2026-03-31'])
        ->assertCreated()
        ->assertJsonPath('data.progress.total', 2500)
        ->assertJsonPath('data.progress.percent', 25);

    expect(app(GoalService::class)->notifyFinished())->toBe(1)
        ->and(AppNotification::where('user_id', $admin->id)->latest('id')->value('description'))->toBe('goal failed: Q1 income');
});

it('requires a contract type for contract goals', function () {
    $admin = signIn(companyAdmin());
    $type = ContractType::create(['company_id' => $admin->company_id, 'name' => 'AMC']);

    $this->postJson('/api/goals', ['subject' => 'AMCs', 'goal_type' => 5, 'achievement' => 3, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31'])->assertUnprocessable();
    $this->postJson('/api/goals', ['subject' => 'AMCs', 'goal_type' => 5, 'contract_type_id' => $type->id, 'achievement' => 3, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31'])->assertCreated();
});

it('exports invoices of a date range as a zip of PDFs', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    foreach ([1, 2] as $n) {
        $this->postJson('/api/invoices', ['customer_id' => $customer->id, 'date' => '2026-05-0'.$n, 'items' => [['description' => 'x', 'qty' => 1, 'rate' => 100]]]);
    }

    $response = $this->post('/api/bulk-pdf', ['type' => 'invoices', 'from' => '2026-05-01', 'to' => '2026-05-31'], ['Accept' => 'application/json']);

    $response->assertOk();
    $zip = new ZipArchive;
    $zip->open($response->baseResponse->getFile()->getPathname());
    expect($zip->numFiles)->toBe(2);
});
