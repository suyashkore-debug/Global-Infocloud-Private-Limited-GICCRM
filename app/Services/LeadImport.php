<?php

namespace App\Services;

use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use App\Support\CompanyTime;
use App\Support\PhoneNumber;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Perfex "Import Leads", made forgiving: the CSV's columns are matched by their headings (in any
 * order, with common other names such as "Mobile" or "E-mail ID"), and the person can change the
 * match before importing. Status, source and assignee match by name; rows repeating an existing
 * lead's e-mail / phone / website / company (Setup → Leads → unique validation, phones compared by
 * their digits) are skipped with the reason. Leads can be shared out among several staff in turn.
 * A simulation reads the file without saving and returns the first rows as they would be imported.
 */
class LeadImport
{
    /** What a CSV column can fill: key => [heading in the sample file, other headings it is known by]. */
    public const FIELDS = [
        'name' => ['Name', ['full name', 'lead name', 'contact name', 'customer name', 'client name', 'person']],
        'first_name' => ['First Name', ['firstname', 'given name', 'fname']],
        'last_name' => ['Last Name', ['lastname', 'surname', 'family name', 'lname']],
        'title' => ['Position', ['title', 'designation', 'job title', 'role']],
        'company' => ['Company', ['company name', 'organisation', 'organization', 'business', 'business name', 'firm']],
        'description' => ['Description', ['notes', 'note', 'remarks', 'comments', 'requirement', 'message', 'details']],
        'country' => ['Country', []],
        'zip' => ['Zip', ['zip code', 'zipcode', 'pin', 'pincode', 'pin code', 'postal code', 'postcode']],
        'city' => ['City', ['town', 'district']],
        'state' => ['State', ['province', 'region']],
        'address' => ['Address', ['street', 'street address', 'address line 1', 'location']],
        'status' => ['Status', ['lead status', 'stage']],
        'source' => ['Source', ['lead source', 'channel', 'medium']],
        'email' => ['Email', ['e-mail', 'email id', 'email address', 'e-mail id', 'mail', 'mail id']],
        'website' => ['Website', ['web', 'url', 'site', 'web site']],
        'phone' => ['Phonenumber', ['phone', 'phone number', 'mobile', 'mobile number', 'mobile no', 'contact', 'contact no', 'contact number', 'whatsapp', 'whatsapp number', 'cell', 'telephone', 'tel', 'number', 'ph no']],
        'lead_value' => ['Lead value', ['value', 'amount', 'budget', 'deal value']],
        'tags' => ['Tags', ['tag', 'labels', 'label']],
        'assigned' => ['Assigned', ['assignee', 'assigned to', 'owner', 'lead owner', 'sales person', 'salesperson', 'staff', 'executive']],
        'next_follow_up_at' => ['Next Follow-up', ['follow up', 'follow-up', 'followup', 'next followup', 'follow up date', 'next follow up date', 'callback', 'call back']],
    ];

    /** The columns of the sample file, in its order (Perfex's, then the newer ones). */
    public const SAMPLE_ORDER = ['name', 'title', 'company', 'description', 'country', 'zip', 'city', 'state', 'address', 'status', 'source', 'email', 'website', 'phone', 'lead_value', 'tags'];

    public const MAX_ROWS = 5000;

    /** Rows shown when simulating. */
    public const PREVIEW_ROWS = 100;

    /** Simulating more rows than this: suggest splitting the file. */
    public const WARN_ROWS = 500;

    /** Skipped rows listed with their reason. */
    public const SKIPPED_SHOWN = 100;

    /** @var Collection<int, CustomField> */
    private Collection $customFields;

    /** @var Collection<int, LeadStatus> */
    private Collection $statuses;

    /** @var Collection<int, LeadSource> */
    private Collection $sources;

    /** @var Collection<int, User> */
    private Collection $staff;

    public function __construct(private User $user, private Notifier $notifier)
    {
        $this->customFields = CustomFields::definitions('leads', $user);
        $this->statuses = LeadStatus::orderBy('status_order')->get();
        $this->sources = LeadSource::orderBy('name')->get();
        $this->staff = User::where('company_id', $user->company_id)->where('is_active', true)->get(['id', 'full_name', 'email', 'username']);
    }

    /**
     * What a column can be imported into: the lead fields, then the custom fields.
     *
     * @return array<int, array{key: string, heading: string, required: bool}>
     */
    public function fields(): array
    {
        return [
            ...collect(self::FIELDS)->map(fn ($f, $key) => ['key' => $key, 'heading' => $f[0], 'required' => false])->values()->all(),
            ...$this->customFields->map(fn (CustomField $f) => ['key' => "cf_{$f->id}", 'heading' => $f->name, 'required' => false])->all(),
        ];
    }

    /**
     * The headings of the sample file: Perfex's columns, then the custom fields.
     *
     * @return array<int, array{key: string, heading: string, required: bool}>
     */
    public function headings(): array
    {
        return [
            ...array_map(fn ($key) => ['key' => $key, 'heading' => self::FIELDS[$key][0], 'required' => $key === 'name'], self::SAMPLE_ORDER),
            ...$this->customFields->map(fn (CustomField $f) => ['key' => "cf_{$f->id}", 'heading' => $f->name, 'required' => false])->all(),
        ];
    }

    /** The sample file: the headings and one row of example values. */
    public function sampleCsv(): string
    {
        $example = ['email' => 'lead'.substr(uniqid(), -6).'@example.com', 'tags' => 'tag1,tag2', 'lead_value' => '25000', 'phone' => '9876543210'];
        $out = fopen('php://temp', 'r+');
        fputcsv($out, array_column($this->headings(), 'heading'));
        fputcsv($out, array_map(fn ($h) => $example[$h['key']] ?? 'Sample Data', $this->headings()));
        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);

        return $csv;
    }

    /**
     * Read the CSV and import (or only simulate) its rows.
     *
     * @param  array{status_id: int, source_id: int, assigned_ids?: array<int, int>, assigned_id?: ?int, simulate: bool, mapping?: ?array<int, ?string>}  $options
     * @return array<string, mixed>
     */
    public function run(string $path, array $options): array
    {
        [$header, $rows] = $this->readRows($path);
        $mapping = $this->mapping($header, $options['mapping'] ?? null);
        $mapped = array_filter($mapping);
        if (! array_intersect($mapped, ['name', 'first_name', 'last_name', 'company', 'email', 'phone'])) {
            throw new LeadImportException('Match at least one column to Name, First Name, Company, Email or Phone.');
        }

        $total = count($rows);
        $unique = array_values(array_filter(explode(',', Options::get('lead_unique_validation')), fn ($f) => in_array($f, ['email', 'phone', 'website', 'company'], true)));
        $existing = $this->existingValues($unique);
        $assignees = array_values(array_unique(array_map('intval', $options['assigned_ids'] ?? array_filter([$options['assigned_id'] ?? null]))));
        $state = ['imported' => 0, 'skipped' => [], 'skipped_count' => 0, 'invalid_emails' => 0, 'preview' => [], 'turn' => 0, 'per_staff' => []];

        $import = function () use ($rows, $mapping, $options, $unique, &$existing, $assignees, &$state) {
            foreach ($rows as $i => $row) {
                $lead = $this->mapRow($row, $mapping, $options);
                if ($lead['invalid_email']) {
                    $state['invalid_emails']++;
                }
                if ($reason = $this->duplicateReason($lead['fields'], $unique, $existing)) {
                    $state['skipped_count']++;
                    if (count($state['skipped']) < self::SKIPPED_SHOWN) {
                        $state['skipped'][] = ['row' => $i + 2, 'name' => $lead['fields']['name'], 'reason' => $reason];
                    }

                    continue;
                }
                foreach ($unique as $field) {
                    if (($key = $this->uniqueKey($field, $lead['fields'][$field] ?? null)) !== null) {
                        $existing[$field][$key] = true;
                    }
                }
                // The row's own assignee, else the chosen staff in turn.
                if (! $lead['fields']['assigned_id'] && $assignees) {
                    $lead['fields']['assigned_id'] = $assignees[$state['turn']++ % count($assignees)];
                }
                $state['imported']++;
                if ($lead['fields']['assigned_id']) {
                    $state['per_staff'][$lead['fields']['assigned_id']] = ($state['per_staff'][$lead['fields']['assigned_id']] ?? 0) + 1;
                }

                if ($options['simulate']) {
                    if (count($state['preview']) < self::PREVIEW_ROWS) {
                        $state['preview'][] = ['row' => $i + 2, ...$this->forPreview($lead)];
                    }

                    continue;
                }
                $this->save($lead);
            }
        };

        $options['simulate'] ? $import() : DB::transaction($import);

        if (! $options['simulate']) {
            foreach ($state['per_staff'] as $userId => $count) {
                if ((int) $userId !== $this->user->id) {
                    $this->notifier->notify([$userId], "{$count} imported lead".($count === 1 ? ' was' : 's were').' assigned to you', '/leads');
                }
            }
        }

        return [
            'simulation' => $options['simulate'],
            'total_rows' => $total,
            'imported' => $state['imported'],
            'skipped_duplicates' => $state['skipped_count'],
            'skipped' => $state['skipped'],
            'invalid_emails' => $state['invalid_emails'],
            'unique_fields' => $unique,
            'assigned' => collect($state['per_staff'])->map(fn ($count, $id) => ['id' => (int) $id, 'name' => $this->staff->firstWhere('id', (int) $id)?->full_name, 'count' => $count])->values()->all(),
            'warning' => $options['simulate'] && $total > self::WARN_ROWS
                ? 'We recommend splitting the CSV file into smaller files of about '.self::WARN_ROWS.' rows; yours has '.$total.'.'
                : null,
            // The file's columns and what each one fills.
            'columns' => array_map(fn ($heading, $i) => ['index' => $i, 'heading' => $heading, 'key' => $mapping[$i] ?? null, 'example' => $rows[0][$i] ?? ''], $header, array_keys($header)),
            'fields' => $this->fields(),
            'headings' => $this->previewHeadings($mapping),
            'preview' => $state['preview'],
        ];
    }

    /**
     * The heading row and the data rows of the file. Comma or semicolon separated (Excel saves
     * either, by region); a UTF-8 byte order mark is ignored.
     *
     * @return array{0: array<int, string>, 1: array<int, array<int, string>>}
     */
    private function readRows(string $path): array
    {
        $content = preg_replace('/^\xEF\xBB\xBF/', '', (string) file_get_contents($path));
        // Excel on Windows may save in the local code page rather than UTF-8.
        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }
        $first = strtok($content, "\n") ?: '';
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : (substr_count($first, "\t") > substr_count($first, ',') ? "\t" : ',');
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $content);
        rewind($handle);

        $rows = [];
        while (($row = fgetcsv($handle, null, $delimiter, '"', '')) !== false) {
            if ($row === [null] || count(array_filter($row, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            $rows[] = array_map(fn ($v) => trim((string) $v), $row);
        }
        fclose($handle);

        if (count($rows) <= 1) {
            throw new LeadImportException('Not enough rows to import: the file needs the heading row and at least one lead.');
        }
        $header = array_shift($rows);
        if (count($rows) > self::MAX_ROWS) {
            throw new LeadImportException('The file has '.count($rows).' rows; import at most '.self::MAX_ROWS.' at a time (split the file).');
        }

        return [$header, $rows];
    }

    /**
     * What each column of the file fills: the person's choice, else matched by its heading. A file
     * whose headings match nothing is read in the sample's column order (as Perfex did).
     *
     * @param  array<int, string>  $header
     * @param  array<int|string, ?string>|null  $chosen
     * @return array<int, ?string>
     */
    private function mapping(array $header, ?array $chosen): array
    {
        $keys = array_column($this->fields(), 'key');
        if ($chosen !== null) {
            $used = [];
            $out = [];
            foreach (array_keys($header) as $i) {
                $key = $chosen[$i] ?? null;
                // Each field from one column only; unknown keys are ignored.
                $out[$i] = $key && in_array($key, $keys, true) && ! isset($used[$key]) ? $key : null;
                if ($out[$i]) {
                    $used[$key] = true;
                }
            }

            return $out;
        }

        $norm = fn (string $s) => preg_replace('/[^a-z0-9]+/', '', mb_strtolower($s));
        $names = [];
        foreach (self::FIELDS as $key => [$heading, $aliases]) {
            foreach ([$heading, $key, ...$aliases] as $name) {
                $names[$norm($name)] ??= $key;
            }
        }
        foreach ($this->customFields as $field) {
            $names[$norm($field->name)] ??= "cf_{$field->id}";
        }
        $used = [];
        $out = [];
        foreach ($header as $i => $heading) {
            $key = $names[$norm($heading)] ?? null;
            $out[$i] = $key && ! isset($used[$key]) ? $key : null;
            if ($out[$i]) {
                $used[$key] = true;
            }
        }
        if (! array_filter($out)) {
            $positional = [...self::SAMPLE_ORDER, ...$this->customFields->map(fn ($f) => "cf_{$f->id}")->all()];
            foreach (array_keys($header) as $i) {
                $out[$i] = $positional[$i] ?? null;
            }
        }

        return $out;
    }

    /**
     * One CSV row as lead fields, tags and custom field values.
     *
     * @param  array<int, string>  $row
     * @param  array<int, ?string>  $mapping
     * @param  array<string, mixed>  $options
     * @return array{fields: array<string, mixed>, tags: array<int, string>, custom: array<int, string>, invalid_email: bool}
     */
    private function mapRow(array $row, array $mapping, array $options): array
    {
        $values = [];
        foreach ($mapping as $i => $key) {
            if ($key) {
                $v = $row[$i] ?? '';
                $values[$key] = in_array($v, ['NULL', 'null', '-'], true) ? '' : $v;
            }
        }
        $get = fn (string $key) => $values[$key] ?? '';
        $text = fn (string $key, int $max = 300) => $get($key) === '' ? null : mb_substr($get($key), 0, $max);

        $email = mb_strtolower($get('email'));
        $invalidEmail = $email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL);
        $first = $text('first_name', 191);
        $last = $text('last_name', 191);
        $name = $get('name') !== '' ? $get('name') : trim(($first ?? '').' '.($last ?? ''));
        $name = $name !== '' ? $name : ($text('company') ?? ($email ?: null) ?? $text('phone') ?? '/');

        $fields = [
            'name' => mb_substr($name, 0, 300),
            'title' => $text('title', 100),
            'company' => $text('company'),
            'description' => $text('description', 65000),
            'country' => $text('country', 100),
            'zip' => $text('zip', 20),
            'city' => $text('city', 100),
            'state' => $text('state', 100),
            'address' => $text('address', 200),
            'email' => $email === '' || $invalidEmail ? null : mb_substr($email, 0, 150),
            'website' => $text('website', 150),
            'phone' => $text('phone', 50),
            'lead_value' => is_numeric($n = str_replace([',', '₹', '$', ' '], '', $get('lead_value'))) ? (float) $n : null,
            'lead_status_id' => $this->match($this->statuses, $get('status'))?->id ?? $options['status_id'],
            'lead_source_id' => $this->match($this->sources, $get('source'))?->id ?? $options['source_id'],
            'assigned_id' => $this->staffMember($get('assigned'))?->id,
            'next_follow_up_at' => $this->date($get('next_follow_up_at')),
        ];
        // Given first / last names stay as they are (the full name is made from them).
        if ($first !== null && $get('name') === '') {
            $fields['first_name'] = $first;
            $fields['last_name'] = $last;
        }
        $tags = array_values(array_unique(array_filter(array_map('trim', preg_split('/[,;|]/', $get('tags')) ?: []))));
        $custom = [];
        foreach ($this->customFields as $field) {
            if (($v = $get("cf_{$field->id}")) !== '') {
                $custom[$field->id] = $v;
            }
        }

        return ['fields' => $fields, 'tags' => $tags, 'custom' => $custom, 'invalid_email' => $invalidEmail];
    }

    /** A status or source by name (any case) or id. */
    private function match(Collection $list, string $value): ?object
    {
        if ($value === '') {
            return null;
        }

        return $list->first(fn ($item) => mb_strtolower($item->name) === mb_strtolower($value) || (ctype_digit($value) && (int) $value === $item->id));
    }

    /** A staff member of the company by full name, e-mail or username (any case). */
    private function staffMember(string $value): ?User
    {
        $value = mb_strtolower(trim($value));
        if ($value === '') {
            return null;
        }

        return $this->staff->first(fn (User $u) => in_array($value, array_map(fn ($v) => mb_strtolower((string) $v), [$u->full_name, $u->email, $u->username]), true));
    }

    /** A follow-up date or date and time (YYYY-MM-DD [HH:MM], or DD-MM-YYYY / DD/MM/YYYY) in the company's time. */
    private function date(string $value): ?Carbon
    {
        if ($value === '') {
            return null;
        }
        $value = preg_replace('#^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})#', '$3-$2-$1', $value);
        try {
            $date = Carbon::parse($value, CompanyTime::zone());
            // A date alone: 10 AM that day.
            if (! preg_match('/\d{1,2}:\d{2}/', $value)) {
                $date->setTime(10, 0);
            }

            return $date->utc();
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * The existing leads' unique values, as compared (phones by digits, the rest in lower case).
     *
     * @param  array<int, string>  $unique
     * @return array<string, array<string, bool>>
     */
    private function existingValues(array $unique): array
    {
        $out = [];
        foreach ($unique as $field) {
            $out[$field] = [];
            foreach (Lead::query()->whereNotNull($field)->where($field, '!=', '')->pluck($field) as $value) {
                if (($key = $this->uniqueKey($field, $value)) !== null) {
                    $out[$field][$key] = true;
                }
            }
        }

        return $out;
    }

    private function uniqueKey(string $field, mixed $value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return $field === 'phone' ? (PhoneNumber::key($value) ?: null) : mb_strtolower($value);
    }

    /**
     * Why the row is a duplicate (e.g. "Email already exists"), or null.
     *
     * @param  array<string, mixed>  $fields
     * @param  array<int, string>  $unique
     * @param  array<string, array<string, bool>>  $existing
     */
    private function duplicateReason(array $fields, array $unique, array $existing): ?string
    {
        foreach ($unique as $field) {
            $key = $this->uniqueKey($field, $fields[$field] ?? null);
            if ($key !== null && isset($existing[$field][$key])) {
                return ucfirst($field).' '.$fields[$field].' already exists';
            }
        }

        return null;
    }

    /**
     * @param  array{fields: array<string, mixed>, tags: array<int, string>, custom: array<int, string>}  $lead
     */
    private function save(array $lead): void
    {
        $fields = $lead['fields'];
        $model = Lead::create([
            ...$fields,
            'assigned_at' => $fields['assigned_id'] ? Carbon::today() : null,
            'follow_up_by' => $fields['next_follow_up_at'] ? $this->user->id : null,
            'last_status_change_at' => now(),
            'created_by' => $this->user->id,
        ]);
        $model->syncTagNames($lead['tags']);
        foreach ($lead['custom'] as $fieldId => $v) {
            CustomFieldValue::create(['custom_field_id' => $fieldId, 'rel_id' => $model->id, 'value' => $v]);
        }
        $model->logActivity('Imported lead');
    }

    /**
     * The preview's columns: the matched fields, in the sample's order.
     *
     * @param  array<int, ?string>  $mapping
     * @return array<int, array{key: string, heading: string, required: bool}>
     */
    private function previewHeadings(array $mapping): array
    {
        $used = array_filter($mapping);
        $always = ['name', 'status', 'source'];

        return array_values(array_filter($this->fields(), fn ($f) => in_array($f['key'], $always, true) || in_array($f['key'], $used, true)));
    }

    /**
     * A row as it would be imported, keyed like fields(): names instead of ids.
     *
     * @param  array{fields: array<string, mixed>, tags: array<int, string>, custom: array<int, string>}  $lead
     * @return array<string, string>
     */
    private function forPreview(array $lead): array
    {
        $f = $lead['fields'];
        $out = [];
        foreach (array_keys(self::FIELDS) as $key) {
            $out[$key] = (string) match ($key) {
                'status' => $this->statuses->firstWhere('id', $f['lead_status_id'])?->name ?? '',
                'source' => $this->sources->firstWhere('id', $f['lead_source_id'])?->name ?? '',
                'assigned' => $f['assigned_id'] ? ($this->staff->firstWhere('id', $f['assigned_id'])?->full_name ?? '') : '',
                'tags' => implode(', ', $lead['tags']),
                'next_follow_up_at' => $f['next_follow_up_at'] ? $f['next_follow_up_at']->copy()->setTimezone(CompanyTime::zone())->format('d M Y, h:i A') : '',
                'first_name', 'last_name' => $f[$key] ?? '',
                default => $f[$key] ?? '',
            };
        }
        foreach ($this->customFields as $field) {
            $out["cf_{$field->id}"] = $lead['custom'][$field->id] ?? '';
        }

        return $out;
    }
}
