<?php

namespace App\Services;

use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Perfex "Import Leads": a CSV whose columns follow the sample file (Name, Position, Company, …,
 * Tags, then the lead custom fields), read by position. Status and source match by name or id,
 * falling back to the chosen ones; rows that repeat an existing lead's e-mail / phone / website
 * (Setup → Leads → unique validation) are skipped. A simulation reads the file without saving and
 * returns the first rows as they would be imported.
 */
class LeadImport
{
    /** The lead columns of the CSV, in order: [lead field, heading]. */
    public const COLUMNS = [
        ['name', 'Name'],
        ['title', 'Position'],
        ['company', 'Company'],
        ['description', 'Description'],
        ['country', 'Country'],
        ['zip', 'Zip'],
        ['city', 'City'],
        ['state', 'State'],
        ['address', 'Address'],
        ['status', 'Status'],
        ['source', 'Source'],
        ['email', 'Email'],
        ['website', 'Website'],
        ['phone', 'Phonenumber'],
        ['lead_value', 'Lead value'],
        ['tags', 'Tags'],
    ];

    public const REQUIRED = ['name'];

    public const MAX_ROWS = 5000;

    /** Rows shown when simulating. */
    public const PREVIEW_ROWS = 100;

    /** Simulating more rows than this: suggest splitting the file. */
    public const WARN_ROWS = 500;

    /** @var Collection<int, CustomField> */
    private Collection $customFields;

    /** @var Collection<int, LeadStatus> */
    private Collection $statuses;

    /** @var Collection<int, LeadSource> */
    private Collection $sources;

    public function __construct(private User $user, private Notifier $notifier)
    {
        $this->customFields = CustomFields::definitions('leads', $user);
        $this->statuses = LeadStatus::orderBy('status_order')->get();
        $this->sources = LeadSource::orderBy('name')->get();
    }

    /**
     * The headings of the CSV: the lead columns, then the custom fields.
     *
     * @return array<int, array{key: string, heading: string, required: bool}>
     */
    public function headings(): array
    {
        return [
            ...array_map(fn ($c) => ['key' => $c[0], 'heading' => $c[1], 'required' => in_array($c[0], self::REQUIRED, true)], self::COLUMNS),
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
     * @param  array{status_id: int, source_id: int, assigned_id: ?int, simulate: bool}  $options
     * @return array<string, mixed>
     */
    public function run(string $path, array $options): array
    {
        $rows = $this->readRows($path);
        $total = count($rows);
        $unique = array_values(array_filter(explode(',', Options::get('lead_unique_validation')), fn ($f) => in_array($f, ['email', 'phone', 'website', 'company'], true)));
        $seen = [];
        $imported = 0;
        $skipped = 0;
        $preview = [];

        $import = function () use ($rows, $options, $unique, &$seen, &$imported, &$skipped, &$preview) {
            foreach ($rows as $i => $row) {
                $lead = $this->mapRow($row, $options);
                if ($this->isDuplicate($lead['fields'], $unique, $seen)) {
                    $skipped++;

                    continue;
                }
                foreach ($unique as $field) {
                    if (($lead['fields'][$field] ?? '') !== '') {
                        $seen[$field][mb_strtolower($lead['fields'][$field])] = true;
                    }
                }
                $imported++;

                if ($options['simulate']) {
                    if (count($preview) < self::PREVIEW_ROWS) {
                        $preview[] = ['row' => $i + 2, ...$this->forPreview($lead)];
                    }

                    continue;
                }
                $this->save($lead, $options);
            }
        };

        $options['simulate'] ? $import() : DB::transaction($import);

        if (! $options['simulate'] && $imported > 0 && $options['assigned_id'] && $options['assigned_id'] !== $this->user->id) {
            $this->notifier->notify([$options['assigned_id']], "{$imported} imported lead".($imported === 1 ? ' was' : 's were').' assigned to you', '/leads');
        }

        return [
            'simulation' => $options['simulate'],
            'total_rows' => $total,
            'imported' => $imported,
            'skipped_duplicates' => $skipped,
            'unique_fields' => $unique,
            'warning' => $options['simulate'] && $total > self::WARN_ROWS
                ? 'We recommend splitting the CSV file into smaller files of about '.self::WARN_ROWS.' rows; yours has '.$total.'.'
                : null,
            'headings' => $this->headings(),
            'preview' => $preview,
        ];
    }

    /**
     * The data rows of the file (the heading row dropped). Comma or semicolon separated (Excel saves
     * either, by region); a UTF-8 byte order mark is ignored.
     *
     * @return array<int, array<int, string>>
     */
    private function readRows(string $path): array
    {
        $content = preg_replace('/^\xEF\xBB\xBF/', '', (string) file_get_contents($path));
        // Excel on Windows may save in the local code page rather than UTF-8.
        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }
        $first = strtok($content, "\n") ?: '';
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
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
        array_shift($rows);
        if (count($rows) > self::MAX_ROWS) {
            throw new LeadImportException('The file has '.count($rows).' rows; import at most '.self::MAX_ROWS.' at a time (split the file).');
        }

        return $rows;
    }

    /**
     * One CSV row as lead fields, tags and custom field values.
     *
     * @param  array<int, string>  $row
     * @param  array<string, mixed>  $options
     * @return array{fields: array<string, mixed>, tags: array<int, string>, custom: array<int, string>}
     */
    private function mapRow(array $row, array $options): array
    {
        $value = fn (int $i) => in_array($v = $row[$i] ?? '', ['NULL', 'null'], true) ? '' : $v;
        $fields = [];
        $tags = [];
        foreach (self::COLUMNS as $i => [$key]) {
            $v = $value($i);
            match ($key) {
                'name' => $fields['name'] = mb_substr($v === '' ? '/' : $v, 0, 300),
                'status' => $fields['lead_status_id'] = $this->match($this->statuses, $v)?->id ?? $options['status_id'],
                'source' => $fields['lead_source_id'] = $this->match($this->sources, $v)?->id ?? $options['source_id'],
                'lead_value' => $fields['lead_value'] = is_numeric($n = str_replace([',', '₹', ' '], '', $v)) ? (float) $n : null,
                'tags' => $tags = array_values(array_unique(array_filter(array_map('trim', explode(',', $v))))),
                'email' => $fields['email'] = $v === '' ? null : mb_strtolower(mb_substr($v, 0, 150)),
                default => $fields[$key] = $v === '' ? null : mb_substr($v, 0, 300),
            };
        }
        $custom = [];
        foreach ($this->customFields->values() as $n => $field) {
            $v = $value(count(self::COLUMNS) + $n);
            if ($v !== '') {
                $custom[$field->id] = $v;
            }
        }

        return ['fields' => $fields, 'tags' => $tags, 'custom' => $custom];
    }

    /** A status or source by name (any case) or id. */
    private function match(Collection $list, string $value): ?object
    {
        if ($value === '') {
            return null;
        }

        return $list->first(fn ($item) => mb_strtolower($item->name) === mb_strtolower($value) || (ctype_digit($value) && (int) $value === $item->id));
    }

    /**
     * Whether a lead with the same e-mail / phone / website exists already (or came earlier in the file).
     *
     * @param  array<string, mixed>  $fields
     * @param  array<int, string>  $unique
     * @param  array<string, array<string, bool>>  $seen
     */
    private function isDuplicate(array $fields, array $unique, array $seen): bool
    {
        foreach ($unique as $field) {
            $v = (string) ($fields[$field] ?? '');
            if ($v !== '' && (isset($seen[$field][mb_strtolower($v)]) || Lead::where($field, $v)->exists())) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array{fields: array<string, mixed>, tags: array<int, string>, custom: array<int, string>}  $lead
     * @param  array<string, mixed>  $options
     */
    private function save(array $lead, array $options): void
    {
        $model = Lead::create([
            ...$lead['fields'],
            'assigned_id' => $options['assigned_id'],
            'assigned_at' => $options['assigned_id'] ? Carbon::today() : null,
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
     * A row as it would be imported, keyed like headings(): names instead of ids.
     *
     * @param  array{fields: array<string, mixed>, tags: array<int, string>, custom: array<int, string>}  $lead
     * @return array<string, string>
     */
    private function forPreview(array $lead): array
    {
        $f = $lead['fields'];
        $out = [];
        foreach (self::COLUMNS as [$key]) {
            $out[$key] = (string) match ($key) {
                'status' => $this->statuses->firstWhere('id', $f['lead_status_id'])?->name ?? '',
                'source' => $this->sources->firstWhere('id', $f['lead_source_id'])?->name ?? '',
                'tags' => implode(', ', $lead['tags']),
                default => $f[$key] ?? '',
            };
        }
        foreach ($this->customFields as $field) {
            $out["cf_{$field->id}"] = $lead['custom'][$field->id] ?? '';
        }

        return $out;
    }
}
