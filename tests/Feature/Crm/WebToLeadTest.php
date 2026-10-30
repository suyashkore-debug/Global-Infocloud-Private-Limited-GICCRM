<?php

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Lead;
use App\Models\LeadForm;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Task;
use App\Services\DefaultLookups;

function webForm(array $overrides = []): array
{
    DefaultLookups::ensureLeadLists();

    return [
        'name' => 'Website enquiry',
        'fields' => [
            ['type' => 'text', 'name' => 'name', 'label' => 'Your name', 'required' => true],
            ['type' => 'email', 'name' => 'email', 'label' => 'Email', 'required' => true],
            ['type' => 'text', 'name' => 'company', 'label' => 'Company'],
            ['type' => 'select', 'name' => 'budget', 'label' => 'Budget', 'options' => ['Under 1L', '1L+']],
        ],
        'lead_status_id' => LeadStatus::where('name', 'Demo Done')->value('id'),
        'lead_source_id' => LeadSource::where('name', 'Google')->value('id'),
        'submit_btn_name' => 'Send',
        'submit_btn_bg_color' => '#fa6010',
        'submit_btn_text_color' => '#ffffff',
        'submit_action' => 'message',
        'success_submit_msg' => 'Thanks!',
        ...$overrides,
    ];
}

it('lets admins build web to lead forms and turns a submission into a lead', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    $industry = CustomField::create(['company_id' => $admin->company_id, 'field_to' => 'leads', 'name' => 'Industry', 'slug' => 'leads_industry', 'type' => 'input']);
    $fields = [...webForm()['fields'], ['type' => 'text', 'name' => "cf_{$industry->id}", 'label' => 'Industry']];

    $form = $this->postJson('/api/lead-forms', webForm(['fields' => $fields, 'responsible_id' => $sales->id, 'lead_name_prefix' => 'WEB', 'mark_public' => true]))
        ->assertCreated()->json('data');
    $this->getJson('/api/lead-forms')->assertJsonPath('data.0.name', 'Website enquiry');

    auth()->forgetGuards();
    $this->getJson("/api/public/lead-forms/{$form['form_key']}")->assertOk()->assertJsonPath('data.submit_btn_name', 'Send');
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Ravi Patil', 'email' => 'Ravi@Patil.test', 'company' => 'Patil Traders', 'budget' => '1L+', "cf_{$industry->id}" => 'Packaging'])
        ->assertCreated()->assertJsonPath('message', 'Thanks!');

    $lead = Lead::withoutGlobalScopes()->where('company_id', $admin->company_id)->first();
    expect($lead->name)->toBe('WEB Ravi Patil')
        ->and($lead->email)->toBe('ravi@patil.test')
        ->and($lead->description)->toBe('Budget: 1L+')
        ->and($lead->lead_status_id)->toBe($form['lead_status_id'])
        ->and($lead->assigned_id)->toBe($sales->id)
        ->and($lead->is_public)->toBeTrue()
        ->and($lead->lead_form_id)->toBe($form['id'])
        ->and(CustomFieldValue::where('custom_field_id', $industry->id)->where('rel_id', $lead->id)->value('value'))->toBe('Packaging')
        ->and(AppNotification::withoutGlobalScopes()->where('user_id', $sales->id)->count())->toBe(1);
});

it('adds a repeat submission as a task on the existing lead when duplicates are tracked', function () {
    $admin = signIn(companyAdmin());
    $form = $this->postJson('/api/lead-forms', webForm(['allow_duplicate' => false, 'track_duplicate_field' => 'email', 'create_task_on_duplicate' => true]))->json('data');
    auth()->forgetGuards();

    $send = fn () => $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Ravi', 'email' => 'ravi@patil.test'])->assertCreated();
    $send();
    $send();

    expect(Lead::withoutGlobalScopes()->where('company_id', $admin->company_id)->count())->toBe(1);
    $task = Task::withoutGlobalScopes()->where('company_id', $admin->company_id)->first();
    expect($task->name)->toBe('Ravi - Website enquiry')
        ->and($task->lead_id)->toBe(Lead::withoutGlobalScopes()->value('id'))
        ->and($task->description)->toContain('Email: ravi@patil.test');
});

it('checks required fields, hides inactive forms and keeps forms admin-only', function () {
    $admin = signIn(companyAdmin());
    $form = $this->postJson('/api/lead-forms', webForm())->json('data');

    signIn(staffMember($admin->company));
    $this->getJson('/api/lead-forms')->assertForbidden();

    auth()->forgetGuards();
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'No email'])->assertUnprocessable()->assertJsonValidationErrors('email');

    LeadForm::withoutGlobalScopes()->whereKey($form['id'])->update(['active' => false]);
    $this->getJson("/api/public/lead-forms/{$form['form_key']}")->assertNotFound();
});

it('e-mails the lead a thank-you and the responsible person when the templates are on', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    App\Services\Emails::template('new-web-to-lead-form-submitted', $admin->company_id)?->update(['active' => true]);
    $form = $this->postJson('/api/lead-forms', webForm(['responsible_id' => $sales->id]))->json('data');
    auth()->forgetGuards();

    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Ravi', 'email' => 'ravi@patil.test'])->assertCreated();
    $sent = App\Models\EmailLog::withoutGlobalScopes()->where('company_id', $admin->company_id)->pluck('template', 'to');
    expect($sent['ravi@patil.test'] ?? null)->toBe('new-web-to-lead-form-submitted')
        ->and($sent[strtolower($sales->email)] ?? null)->toBe('new-lead-assigned');
});

it('asks for reCAPTCHA on forms that use it once the keys are saved', function () {
    $admin = signIn(companyAdmin());
    $form = $this->postJson('/api/lead-forms', webForm(['recaptcha' => true]))->assertCreated()->json('data');
    $key = $form['form_key'];
    $payload = ['name' => 'Bot', 'email' => 'bot@x.test'];

    // No keys yet: the form works without a captcha, as in Perfex.
    auth()->forgetGuards();
    $this->getJson("/api/public/lead-forms/{$key}")->assertJsonPath('data.recaptcha_site_key', null);
    $this->postJson("/api/public/lead-forms/{$key}", $payload)->assertCreated();

    signIn($admin);
    $this->putJson('/api/settings/recaptcha', ['site_key' => 'site-123', 'secret_key' => 'secret-456'])
        ->assertOk()->assertJsonPath('data.has_secret_key', true)->assertJsonMissing(['secret-456']);
    expect(App\Models\Option::withoutGlobalScopes()->where('name', 'recaptcha_secret_key')->value('value'))->not->toBe('secret-456');

    auth()->forgetGuards();
    $this->getJson("/api/public/lead-forms/{$key}")->assertJsonPath('data.recaptcha_site_key', 'site-123');
    $this->postJson("/api/public/lead-forms/{$key}", $payload)->assertUnprocessable()->assertJsonValidationErrors('recaptcha');

    Http::fake(['www.google.com/recaptcha/*' => Http::sequence()->push(['success' => false])->push(['success' => true])]);
    $this->postJson("/api/public/lead-forms/{$key}", [...$payload, 'g-recaptcha-response' => 'bad'])->assertUnprocessable();
    $this->postJson("/api/public/lead-forms/{$key}", [...$payload, 'email' => 'human@x.test', 'g-recaptcha-response' => 'good'])->assertCreated();
    Http::assertSent(fn ($r) => $r['secret'] === 'secret-456' && $r['response'] === 'good');
    expect(Lead::where('email', 'human@x.test')->exists())->toBeTrue();
});
