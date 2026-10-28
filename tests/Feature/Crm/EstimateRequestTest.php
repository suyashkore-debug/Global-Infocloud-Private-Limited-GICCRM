<?php

use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\EstimateRequest;
use App\Models\EstimateRequestForm;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function quoteForm($test, array $overrides = []): EstimateRequestForm
{
    $id = $test->postJson('/api/estimate-request-forms', [
        'name' => 'Website quote',
        'fields' => [
            ['type' => 'text', 'name' => 'company', 'label' => 'Company', 'required' => true],
            ['type' => 'select', 'name' => 'service', 'label' => 'Service', 'options' => ['ERP', 'CRM']],
            ['type' => 'file', 'name' => 'files', 'label' => 'Attachments'],
        ],
        ...$overrides,
    ])->assertCreated()->json('data.id');

    return EstimateRequestForm::findOrFail($id);
}

it('adds a required email field to every form', function () {
    signIn(companyAdmin());
    $form = quoteForm($this);

    expect($form->fields[0])->toMatchArray(['name' => 'email', 'type' => 'email', 'required' => true]);
});

it('accepts a public submission, stores files and notifies the responsible person', function () {
    Storage::fake('local');
    $admin = signIn(companyAdmin());
    $agent = staffMember($admin->company, ['estimate_request.view_own']);
    $form = quoteForm($this, ['responsible_id' => $agent->id]);
    auth()->forgetGuards();

    $this->getJson("/api/public/quote-forms/{$form->form_key}")->assertOk()->assertJsonPath('data.name', 'Website quote');
    $this->postJson("/api/public/quote-forms/{$form->form_key}", ['email' => 'buyer@x.test'])->assertUnprocessable()->assertJsonValidationErrors('company');
    $this->postJson("/api/public/quote-forms/{$form->form_key}", ['email' => 'buyer@x.test', 'company' => 'Buyer', 'service' => 'HR'])->assertJsonValidationErrors('service');

    $this->post("/api/public/quote-forms/{$form->form_key}", [
        'email' => 'buyer@x.test', 'company' => 'Buyer Ltd', 'service' => 'ERP', 'files' => [UploadedFile::fake()->create('brief.pdf', 10)],
    ], ['Accept' => 'application/json'])->assertCreated();

    $request = EstimateRequest::withoutGlobalScopes()->firstOrFail();
    expect($request->company_id)->toBe($admin->company_id)
        ->and($request->assigned_id)->toBe($agent->id)
        ->and($request->value('company'))->toBe('Buyer Ltd')
        ->and($request->status->flag)->toBe('processing')
        ->and($request->attachments()->count())->toBe(1)
        ->and(AppNotification::withoutGlobalScopes()->where('user_id', $agent->id)->count())->toBe(1);

    // The assigned staff member (view_own) sees it, another staff member with view_own does not.
    signIn($agent);
    $this->getJson('/api/estimate-requests')->assertJsonCount(1, 'data');
    signIn(staffMember($admin->company, ['estimate_request.view_own']));
    $this->getJson('/api/estimate-requests')->assertJsonCount(0, 'data');
    $this->getJson("/api/estimate-requests/{$request->id}")->assertForbidden();
});

it('converts a request to a new customer and completes it when the estimate is saved', function () {
    $admin = signIn(companyAdmin());
    $form = quoteForm($this);
    $request = EstimateRequest::create(['email' => 'buyer@x.test', 'submission' => [['name' => 'company', 'label' => 'Company', 'value' => 'Buyer Ltd']], 'estimate_request_form_id' => $form->id]);

    $this->getJson("/api/estimate-requests/{$request->id}")->assertJsonPath('data.prefill.company', 'Buyer Ltd');
    $customerId = $this->postJson("/api/estimate-requests/{$request->id}/convert", [
        'convert_to' => 'estimate', 'company' => 'Buyer Ltd', 'first_name' => 'Ravi', 'email' => 'buyer@x.test',
    ])->assertOk()->assertJsonPath('data.redirect', fn ($r) => str_starts_with($r, '/estimates/new?customer_id='))->json('data.customer_id');

    expect(Customer::find($customerId)->primaryContact->email)->toBe('buyer@x.test');

    $estimateId = $this->postJson('/api/estimates', [
        'customer_id' => $customerId, 'date' => today()->toDateString(), 'estimate_request_id' => $request->id,
        'items' => [['description' => 'ERP', 'qty' => 1, 'rate' => 1000]],
    ])->assertCreated()->json('data.id');

    $request->refresh();
    expect($request->estimate_id)->toBe($estimateId)->and($request->status->flag)->toBe('completed')->and($request->date_estimated)->not->toBeNull();
});

it('changes status, assignee and tags and deletes a request', function () {
    $admin = signIn(companyAdmin());
    $staff = staffMember($admin->company);
    $request = EstimateRequest::create(['email' => 'a@x.test', 'submission' => []]);
    $statuses = $this->getJson('/api/setup/estimate-request-statuses')->assertJsonCount(3, 'data')->json('data');

    $this->patchJson("/api/estimate-requests/{$request->id}", ['estimate_request_status_id' => $statuses[0]['id'], 'assigned_id' => $staff->id, 'tags' => ['hot']])
        ->assertOk()->assertJsonPath('data.status.name', 'Cancelled')->assertJsonPath('data.assigned.id', $staff->id)->assertJsonPath('data.tags.0', 'hot');
    $this->deleteJson("/api/setup/estimate-request-statuses/{$statuses[0]['id']}")->assertUnprocessable();

    $this->deleteJson("/api/estimate-requests/{$request->id}")->assertOk();
    expect(EstimateRequest::count())->toBe(0);
});

it('does not open an inactive form', function () {
    signIn(companyAdmin());
    $form = quoteForm($this, ['active' => false]);

    $this->getJson("/api/public/quote-forms/{$form->form_key}")->assertNotFound();
});
