<?php

use App\Models\Company;
use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
use App\Services\Options;
use Illuminate\Http\UploadedFile;

/** A CSV in the sample's column order: Name … Tags (16 columns), then custom fields. */
function leadsCsv(array $rows, string $delimiter = ','): UploadedFile
{
    $head = ['Name', 'Position', 'Company', 'Description', 'Country', 'Zip', 'City', 'State', 'Address', 'Status', 'Source', 'Email', 'Website', 'Phonenumber', 'Lead value', 'Tags', 'Industry'];
    $lines = array_map(fn ($r) => implode($delimiter, array_map(fn ($v) => '"'.str_replace('"', '""', $v).'"', $r)), [$head, ...$rows]);

    return UploadedFile::fake()->createWithContent('leads.csv', "\xEF\xBB\xBF".implode("\n", $lines)."\n");
}

function leadRow(array $values): array
{
    $keys = ['name', 'title', 'company', 'description', 'country', 'zip', 'city', 'state', 'address', 'status', 'source', 'email', 'website', 'phone', 'value', 'tags', 'industry'];

    return array_map(fn ($k) => $values[$k] ?? '', $keys);
}

function importLists(): array
{
    DefaultLookups::ensureLeadLists();

    return [LeadStatus::where('name', 'New Lead')->value('id'), LeadSource::where('name', 'Google')->value('id')];
}

it('simulates an import without saving, matching status and source by name and falling back otherwise', function () {
    signIn(companyAdmin());
    [$status, $source] = importLists();

    $data = $this->post('/api/leads/import', [
        'file' => leadsCsv([
            leadRow(['name' => 'Ravi Patil', 'status' => 'demo done', 'source' => 'Google', 'email' => 'ravi@patil.test', 'tags' => 'hot, erp']),
            leadRow(['name' => '', 'status' => 'Unknown status', 'source' => 'NULL', 'value' => '25,000']),
        ]),
        'status_id' => $status,
        'source_id' => $source,
        'simulate' => 1,
    ], ['Accept' => 'application/json'])->assertOk()->json('data');

    expect(Lead::count())->toBe(0)
        ->and($data)->toMatchArray(['simulation' => true, 'total_rows' => 2, 'imported' => 2, 'skipped_duplicates' => 0])
        ->and($data['preview'][0])->toMatchArray(['row' => 2, 'name' => 'Ravi Patil', 'status' => 'Demo Done', 'source' => 'Google', 'tags' => 'hot, erp'])
        ->and($data['preview'][1])->toMatchArray(['name' => '/', 'status' => 'New Lead', 'source' => 'Google', 'lead_value' => '25000']);
});

it('imports leads with tags, the assignee and custom fields, skipping duplicates by the unique validation fields', function () {
    $admin = signIn(companyAdmin());
    $sales = staffMember($admin->company);
    [$status, $source] = importLists();
    $industry = CustomField::create(['company_id' => $admin->company_id, 'field_to' => 'leads', 'name' => 'Industry', 'slug' => 'leads_industry', 'type' => 'input']);
    Options::set('lead_unique_validation', 'email,phone', $admin->company_id);
    Lead::create(['company_id' => $admin->company_id, 'name' => 'Existing', 'email' => 'old@lead.test', 'lead_status_id' => $status, 'lead_source_id' => $source, 'created_by' => $admin->id]);

    $data = $this->post('/api/leads/import', [
        'file' => leadsCsv([
            leadRow(['name' => 'Asha', 'email' => 'asha@lead.test', 'phone' => '9000000001', 'tags' => 'erp', 'industry' => 'Packaging', 'value' => '1500']),
            leadRow(['name' => 'Old one', 'email' => 'OLD@lead.test']),
            leadRow(['name' => 'Twin', 'phone' => '9000000001']),
            leadRow(['name' => 'Kiran', 'company' => 'Kiran Corrugators', 'status' => 'Demo Done']),
        ], ';'),
        'status_id' => $status,
        'source_id' => $source,
        'assigned_id' => $sales->id,
    ], ['Accept' => 'application/json'])->assertOk()->json('data');

    expect($data)->toMatchArray(['simulation' => false, 'total_rows' => 4, 'imported' => 2, 'skipped_duplicates' => 2]);
    $asha = Lead::where('name', 'Asha')->first();
    expect($asha->assigned_id)->toBe($sales->id)
        ->and((float) $asha->lead_value)->toBe(1500.0)
        ->and($asha->tags->pluck('name')->all())->toBe(['erp'])
        ->and(CustomFieldValue::where('custom_field_id', $industry->id)->where('rel_id', $asha->id)->value('value'))->toBe('Packaging')
        ->and($asha->activities()->value('description'))->toBe('Imported lead')
        ->and(Lead::where('name', 'Kiran')->value('lead_status_id'))->toBe(LeadStatus::where('name', 'Demo Done')->value('id'));
});

it('lets only admins import unless Setup allows other staff, and serves the sample file', function () {
    $company = Company::factory()->create();
    $staff = staffMember($company);
    signIn($staff);
    $this->getJson('/api/leads/import')->assertForbidden();

    Options::set('allow_non_admin_members_to_import_leads', '1', $company->id);
    $this->getJson('/api/leads/import')->assertOk()->assertJsonPath('data.headings.0', ['key' => 'name', 'heading' => 'Name', 'required' => true]);

    $sample = $this->get('/api/leads/import/sample')->assertOk()->assertHeader('Content-Disposition', 'attachment; filename="sample_leads_import.csv"')->getContent();
    expect(strtok($sample, "\n"))->toStartWith('Name,Position,Company,Description,Country');
});

it('refuses a file with only the heading row', function () {
    signIn(companyAdmin());
    [$status, $source] = importLists();

    $this->post('/api/leads/import', ['file' => leadsCsv([]), 'status_id' => $status, 'source_id' => $source], ['Accept' => 'application/json'])
        ->assertUnprocessable()->assertJsonPath('errors.file.0', 'Not enough rows to import: the file needs the heading row and at least one lead.');
});
