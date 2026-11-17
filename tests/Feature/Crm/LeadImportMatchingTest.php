<?php

use App\Models\Lead;
use App\Models\LeadForm;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
use App\Services\Options;
use Illuminate\Http\UploadedFile;

/** A CSV with the given heading row and rows. */
function csvFile(array $head, array $rows): UploadedFile
{
    $line = fn (array $r) => implode(',', array_map(fn ($v) => '"'.str_replace('"', '""', (string) $v).'"', $r));

    return UploadedFile::fake()->createWithContent('leads.csv', implode("\n", array_map($line, [$head, ...$rows]))."\n");
}

function importRequest(UploadedFile $file, array $extra = []): array
{
    DefaultLookups::ensureLeadLists();

    return ['file' => $file, 'status_id' => LeadStatus::where('name', 'New Lead')->value('id'), 'source_id' => LeadSource::where('name', 'Google')->value('id'), ...$extra];
}

it('matches columns by their headings in any order, with other names, and imports the newer fields', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    $file = csvFile(
        ['Mobile No', 'E-mail ID', 'First Name', 'Last Name', 'City', 'Assigned To', 'Follow Up Date', 'Notes', 'Something else'],
        [
            ['+91 98765 43210', 'Asha@Lead.Test', 'Asha', 'Rao', 'Pune', $sales->email, '25-12-2026 15:30', 'Wants ERP', 'ignored'],
            ['98765 11111', 'not-an-email', 'Kiran', '', 'Nashik', '', '2026-12-26', '', ''],
        ],
    );

    $data = $this->post('/api/leads/import', importRequest($file, ['simulate' => 1]), ['Accept' => 'application/json'])->assertOk()->json('data');
    expect(collect($data['columns'])->pluck('key')->all())->toBe(['phone', 'email', 'first_name', 'last_name', 'city', 'assigned', 'next_follow_up_at', 'description', null])
        ->and($data['preview'][0])->toMatchArray(['name' => 'Asha Rao', 'phone' => '+91 98765 43210', 'email' => 'asha@lead.test', 'assigned' => $sales->full_name, 'next_follow_up_at' => '25 Dec 2026, 03:30 PM'])
        ->and($data['invalid_emails'])->toBe(1)
        ->and(Lead::count())->toBe(0);

    $this->post('/api/leads/import', importRequest($file), ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.imported', 2);
    $asha = Lead::where('first_name', 'Asha')->first();
    expect($asha->name)->toBe('Asha Rao')->and($asha->last_name)->toBe('Rao')->and($asha->assigned_id)->toBe($sales->id)
        ->and($asha->description)->toBe('Wants ERP')->and($asha->next_follow_up_at)->not->toBeNull()
        ->and(Lead::where('first_name', 'Kiran')->value('email'))->toBeNull();
});

it('takes the person\'s own column match, and shares leads out among several staff in turn', function () {
    $admin = signIn(companyAdmin());
    [$a, $b] = [staffMember($admin->company), staffMember($admin->company)];
    $file = csvFile(['Col A', 'Col B'], [['Ravi', '9000000001'], ['Meera', '9000000002'], ['Om', '9000000003']]);

    // Headings that match nothing: read in the sample's order (Name, Position …).
    $guess = $this->post('/api/leads/import', importRequest($file, ['simulate' => 1]), ['Accept' => 'application/json'])->json('data.columns');
    expect(collect($guess)->pluck('key')->all())->toBe(['name', 'title']);

    $data = $this->post('/api/leads/import', importRequest($file, ['mapping' => json_encode(['name', 'phone']), 'assigned_ids' => [$a->id, $b->id]]), ['Accept' => 'application/json'])
        ->assertOk()->json('data');
    expect($data['imported'])->toBe(3)
        ->and(Lead::where('name', 'Ravi')->value('phone'))->toBe('9000000001')
        ->and(Lead::where('name', 'Ravi')->value('assigned_id'))->toBe($a->id)
        ->and(Lead::where('name', 'Meera')->value('assigned_id'))->toBe($b->id)
        ->and(Lead::where('name', 'Om')->value('assigned_id'))->toBe($a->id)
        ->and(collect($data['assigned'])->pluck('count', 'id')->all())->toBe([$a->id => 2, $b->id => 1]);

    // A mapping without any name column is refused.
    $this->post('/api/leads/import', importRequest($file, ['mapping' => json_encode([null, 'city'])]), ['Accept' => 'application/json'])->assertStatus(422);
});

it('compares phones by their digits for duplicates: import, new leads and web forms', function () {
    $admin = signIn(companyAdmin());
    Options::set('lead_unique_validation', 'phone', $admin->company_id);
    DefaultLookups::ensureLeadLists();
    $old = Lead::create(['name' => 'Existing', 'phone' => '98765 43210', 'lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id'), 'created_by' => $admin->id]);

    $data = $this->post('/api/leads/import', importRequest(csvFile(['Name', 'Phone'], [['Twin', '+91-9876543210'], ['New', '9123456780']])), ['Accept' => 'application/json'])->json('data');
    expect($data['imported'])->toBe(1)->and($data['skipped'][0])->toMatchArray(['row' => 2, 'name' => 'Twin']);

    $this->postJson('/api/leads', ['email' => uniqid('lead', true).'@lead.test', 'name' => 'Again', 'phone' => '0 98765 43210', 'lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id')])
        ->assertJsonValidationErrors(['phone' => "Lead #{$old->id} Existing already has this phone number."]);

    $form = LeadForm::create(['name' => 'Site', 'form_key' => 'k-'.uniqid(), 'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name', 'required' => true], ['type' => 'text', 'name' => 'phone', 'label' => 'Phone']],
        'lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id'), 'allow_duplicate' => false, 'track_duplicate_field' => 'phone', 'create_task_on_duplicate' => true,
        'submit_btn_name' => 'Send', 'submit_action' => 'message', 'created_by' => $admin->id, 'active' => true]);
    $this->postJson("/api/public/lead-forms/{$form->form_key}", ['name' => 'Repeat', 'phone' => '+919876543210'])->assertCreated();
    expect(Lead::where('name', 'Repeat')->exists())->toBeFalse()->and($old->tasks()->count())->toBe(1);
});

it('keeps a web form\'s name prefix off the first name, takes first / last names, and ignores spam bots', function () {
    $admin = signIn(companyAdmin());
    DefaultLookups::ensureLeadLists();
    $form = LeadForm::create(['name' => 'Site', 'form_key' => 'k-'.uniqid(), 'lead_name_prefix' => 'WEB',
        'fields' => [['type' => 'text', 'name' => 'first_name', 'label' => 'First name', 'required' => true], ['type' => 'text', 'name' => 'last_name', 'label' => 'Last name']],
        'lead_status_id' => LeadStatus::value('id'), 'lead_source_id' => LeadSource::value('id'), 'allow_duplicate' => true,
        'submit_btn_name' => 'Send', 'submit_action' => 'message', 'created_by' => $admin->id, 'active' => true]);

    $this->postJson("/api/public/lead-forms/{$form->form_key}", ['first_name' => 'Ravi', 'last_name' => 'Patil'])->assertCreated();
    $lead = Lead::latest('id')->first();
    expect($lead->name)->toBe('WEB Ravi Patil')->and($lead->first_name)->toBe('Ravi')->and($lead->last_name)->toBe('Patil');

    // A bot filling the hidden field gets the thank-you; nothing is saved.
    $count = Lead::count();
    $this->postJson("/api/public/lead-forms/{$form->form_key}", ['first_name' => 'Bot', '_company_site' => 'http://spam.test'])->assertCreated();
    expect(Lead::count())->toBe($count);
});
