<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\Contract;
use App\Models\CreditNote;
use App\Models\Customer;
use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Estimate;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Proposal;
use App\Models\Task;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Reads and writes custom field values for any record type, with Perfex's rules (required
 * fields, admin-only fields, choices from the field's options).
 */
class CustomFields
{
    /** @var array<string, class-string<Model>> */
    public const RECORD_TYPES = [
        'leads' => Lead::class,
        'customers' => Customer::class,
        'contacts' => Contact::class,
        'contracts' => Contract::class,
        'tasks' => Task::class,
        'expenses' => Expense::class,
        'invoice' => Invoice::class,
        'credit_note' => CreditNote::class,
        'estimate' => Estimate::class,
        'proposal' => Proposal::class,
        'projects' => Project::class,
        'tickets' => Ticket::class,
        'items' => Item::class,
    ];

    /**
     * Active fields of a type the user may see, in order.
     *
     * @return Collection<int, CustomField>
     */
    public static function definitions(string $fieldTo, User $user): Collection
    {
        return CustomField::where('field_to', $fieldTo)->where('active', true)
            ->when(! $user->isAdmin(), fn ($q) => $q->where('only_admin', false))
            ->orderBy('field_order')->orderBy('id')->get();
    }

    /**
     * Values of the given records: [rel_id => [field_id => value]].
     *
     * @param  array<int, int>  $relIds
     * @return array<int, array<int, string|null>>
     */
    public static function values(string $fieldTo, array $relIds, User $user): array
    {
        $fields = self::definitions($fieldTo, $user)->pluck('id');
        $out = [];
        CustomFieldValue::whereIn('custom_field_id', $fields)->whereIn('rel_id', $relIds)->get()
            ->each(function (CustomFieldValue $v) use (&$out) {
                $out[$v->rel_id][$v->custom_field_id] = $v->value;
            });

        return $out;
    }

    /**
     * Fields shown on a PDF, with their values for one record.
     *
     * @return array<int, array{name: string, value: string}>
     */
    public static function forPdf(string $fieldTo, int $relId, int $companyId): array
    {
        // Always by company: PDFs are also made where nobody is signed in (public links, queue).
        $fields = CustomField::withoutGlobalScopes()->where('company_id', $companyId)->where('field_to', $fieldTo)->where('active', true)->where('show_on_pdf', true)->where('only_admin', false)
            ->orderBy('field_order')->get();
        $values = CustomFieldValue::whereIn('custom_field_id', $fields->pluck('id'))->where('rel_id', $relId)->pluck('value', 'custom_field_id');

        return $fields->map(fn (CustomField $f) => ['name' => $f->name, 'value' => (string) ($values[$f->id] ?? '')])
            ->filter(fn ($row) => $row['value'] !== '')->values()->all();
    }

    /**
     * The record a value belongs to, checked against the user's rights.
     */
    public static function record(string $fieldTo, int $relId, User $user, bool $write): Model
    {
        abort_unless(isset(self::RECORD_TYPES[$fieldTo]), 404);
        $record = self::RECORD_TYPES[$fieldTo]::findOrFail($relId);

        $allowed = match (true) {
            $record instanceof Item => $write ? $user->hasPermission('items', 'edit') || $user->hasPermission('items', 'create') : true,
            $record instanceof Contact => Gate::forUser($user)->allows($write ? 'update' : 'view', $record->customer),
            default => Gate::forUser($user)->allows($write ? 'update' : 'view', $record),
        };
        abort_unless($allowed, 403);

        return $record;
    }

    /**
     * Save the values sent for a record. Fields left out keep their value; admin-only fields
     * are ignored for non-admins.
     *
     * @param  array<int|string, mixed>  $values  [field_id => value]
     */
    public static function save(string $fieldTo, int $relId, array $values, User $user): void
    {
        $fields = self::definitions($fieldTo, $user)->keyBy('id');
        $errors = [];

        foreach ($fields as $id => $field) {
            $sent = array_key_exists($id, $values) || array_key_exists((string) $id, $values);
            $raw = $values[$id] ?? $values[(string) $id] ?? null;
            $value = is_array($raw) ? implode(', ', array_map('strval', $raw)) : (is_bool($raw) ? ($raw ? '1' : '') : trim((string) $raw));

            if ($field->required && $value === '' && ($sent || ! CustomFieldValue::where('custom_field_id', $id)->where('rel_id', $relId)->exists())) {
                $errors["custom_fields.{$id}"] = "{$field->name} is required.";

                continue;
            }
            if (! $sent) {
                continue;
            }
            if ($value !== '' && ($message = self::invalid($field, $raw, $value))) {
                $errors["custom_fields.{$id}"] = $message;

                continue;
            }

            CustomFieldValue::updateOrCreate(['custom_field_id' => $id, 'rel_id' => $relId], ['value' => $value === '' ? null : $value]);
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    private static function invalid(CustomField $field, mixed $raw, string $value): ?string
    {
        $options = array_map('trim', $field->options ?? []);
        $chosen = is_array($raw) ? array_map('strval', $raw) : array_map('trim', explode(',', $value));

        return match ($field->type) {
            'number' => is_numeric($value) ? null : "{$field->name} must be a number.",
            'date_picker', 'date_picker_time' => strtotime($value) !== false ? null : "{$field->name} must be a date.",
            'link' => filter_var($value, FILTER_VALIDATE_URL) ? null : "{$field->name} must be a link (https://...).",
            'colorpicker' => preg_match('/^#[0-9a-fA-F]{3,8}$/', $value) ? null : "{$field->name} must be a colour.",
            'select' => in_array($value, $options, true) ? null : "Choose one of the options for {$field->name}.",
            'multiselect', 'checkbox' => array_diff($chosen, $options) === [] ? null : "Choose from the options for {$field->name}.",
            default => mb_strlen($value) > 65000 ? "{$field->name} is too long." : null,
        };
    }

    /**
     * Remove the values of a deleted record.
     */
    public static function forget(string $fieldTo, int $relId): void
    {
        CustomFieldValue::whereIn('custom_field_id', CustomField::withoutGlobalScopes()->where('field_to', $fieldTo)->select('id'))->where('rel_id', $relId)->delete();
    }
}
