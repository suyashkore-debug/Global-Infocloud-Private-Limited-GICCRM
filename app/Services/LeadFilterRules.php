<?php

namespace App\Services;

use App\Models\CustomField;
use App\Models\Lead;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * Perfex leads "Filters": rules of field, operator and value, all of which a lead must meet. The
 * list sends them as JSON in ?rules=[{"field":"city","op":"contains","value":"Pune"}, …].
 */
class LeadFilterRules
{
    public const TEXT = ['name', 'email', 'phone', 'company', 'title', 'city', 'state', 'zip', 'country', 'website'];

    public const BOOLEAN = ['is_public', 'lost', 'junk'];

    public const DATE = ['last_contact_at', 'created_at', 'assigned_at'];

    public const NUMBER = ['lead_value'];

    public const MULTI = ['lead_status_id', 'lead_source_id'];

    /**
     * The well-formed rules from the request (unknown fields or operators are dropped).
     *
     * @return array<int, array{field: string, op: string, value: mixed, value2: mixed}>
     */
    public static function parse(mixed $input): array
    {
        $rules = is_string($input) ? json_decode($input, true) : $input;
        if (! is_array($rules)) {
            return [];
        }

        return collect($rules)->filter(fn ($r) => is_array($r) && isset($r['field'], $r['op']) && self::knows((string) $r['field']))
            ->map(fn ($r) => ['field' => (string) $r['field'], 'op' => (string) $r['op'], 'value' => $r['value'] ?? null, 'value2' => $r['value2'] ?? null])
            ->take(30)->values()->all();
    }

    /** Whether the rules decide about lost or junk leads themselves (then they are not hidden by default). */
    public static function touchesFlags(array $rules): bool
    {
        return collect($rules)->contains(fn ($r) => in_array($r['field'], ['lost', 'junk'], true));
    }

    /**
     * @param  Builder<Lead>  $query
     * @param  array<int, array{field: string, op: string, value: mixed, value2: mixed}>  $rules
     */
    public static function apply(Builder $query, array $rules): void
    {
        foreach ($rules as $rule) {
            $field = $rule['field'];
            if (preg_match('/^cf_(\d+)$/', $field, $m)) {
                self::custom($query, (int) $m[1], $rule);
            } elseif (in_array($field, self::TEXT, true)) {
                self::text($query, $field, $rule['op'], (string) $rule['value']);
            } elseif (in_array($field, self::BOOLEAN, true)) {
                $query->where($field, filter_var($rule['value'], FILTER_VALIDATE_BOOLEAN));
            } elseif (in_array($field, self::DATE, true)) {
                self::date($query, $field, $rule['op'], $rule['value'], $rule['value2']);
            } elseif (in_array($field, self::NUMBER, true)) {
                self::number($query, $field, $rule['op'], $rule['value'], $rule['value2']);
            } elseif (in_array($field, self::MULTI, true)) {
                $ids = array_map('intval', (array) $rule['value']);
                $ids && ($rule['op'] === 'not_in' ? $query->whereNotIn($field, $ids) : $query->whereIn($field, $ids));
            } elseif ($field === 'assigned_id') {
                match ($rule['op']) {
                    'empty' => $query->whereNull('assigned_id'),
                    'is_not' => $query->where(fn ($q) => $q->whereNull('assigned_id')->orWhere('assigned_id', '!=', (int) $rule['value'])),
                    default => $query->where('assigned_id', (int) $rule['value']),
                };
            }
        }
    }

    private static function knows(string $field): bool
    {
        return in_array($field, [...self::TEXT, ...self::BOOLEAN, ...self::DATE, ...self::NUMBER, ...self::MULTI, 'assigned_id'], true)
            || preg_match('/^cf_\d+$/', $field) === 1;
    }

    private static function text(Builder $query, string $column, string $op, string $value): void
    {
        $like = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $value);
        match ($op) {
            'equals' => $query->where($column, $value),
            'starts_with' => $query->where($column, 'like', "{$like}%"),
            'ends_with' => $query->where($column, 'like', "%{$like}"),
            'not_contains' => $query->where(fn ($q) => $q->whereNull($column)->orWhere($column, 'not like', "%{$like}%")),
            'empty' => $query->where(fn ($q) => $q->whereNull($column)->orWhere($column, '')),
            'not_empty' => $query->whereNotNull($column)->where($column, '!=', ''),
            default => $query->where($column, 'like', "%{$like}%"),
        };
    }

    /** Dates are compared as calendar days in India time (the app clock is UTC). */
    private static function date(Builder $query, string $column, string $op, mixed $value, mixed $value2): void
    {
        $day = fn (mixed $d) => $d ? Carbon::parse((string) $d, 'Asia/Kolkata')->startOfDay() : null;
        $from = $day($value);
        $to = $day($value2);
        // assigned_at is a plain date; the others are UTC timestamps.
        $edge = fn (Carbon $d) => $column === 'assigned_at' ? $d->toDateString() : $d->copy()->utc();
        match ($op) {
            'empty' => $query->whereNull($column),
            'not_empty' => $query->whereNotNull($column),
            'before' => $from && $query->where($column, '<', $edge($from)),
            'after' => $from && $query->where($column, '>=', $edge($from->copy()->addDay())),
            'between' => $from && $to && $query->where($column, '>=', $edge($from))->where($column, '<', $edge($to->copy()->addDay())),
            default => $from && $query->where($column, '>=', $edge($from))->where($column, '<', $edge($from->copy()->addDay())),
        };
    }

    private static function number(Builder $query, string $column, string $op, mixed $value, mixed $value2): void
    {
        if ($op === 'empty') {
            $query->whereNull($column);

            return;
        }
        if (! is_numeric($value)) {
            return;
        }
        $v = (float) $value;
        match ($op) {
            '!=' => $query->where(fn ($q) => $q->whereNull($column)->orWhere($column, '!=', $v)),
            '>', '>=', '<', '<=' => $query->where($column, $op, $v),
            'between' => is_numeric($value2) && $query->whereBetween($column, [$v, (float) $value2]),
            default => $query->where($column, $v),
        };
    }

    /**
     * @param  array{field: string, op: string, value: mixed, value2: mixed}  $rule
     */
    private static function custom(Builder $query, int $fieldId, array $rule): void
    {
        if (! CustomField::where('field_to', 'leads')->whereKey($fieldId)->exists()) {
            return;
        }
        $value = (string) $rule['value'];
        $like = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $value);
        $has = fn ($q) => $q->select('id')->from('custom_field_values')->whereColumn('custom_field_values.rel_id', 'leads.id')->where('custom_field_id', $fieldId);

        match ($rule['op']) {
            'empty' => $query->whereNotExists(fn ($q) => $has($q)->where('value', '!=', '')),
            'not_empty' => $query->whereExists(fn ($q) => $has($q)->where('value', '!=', '')),
            'equals' => $query->whereExists(fn ($q) => $has($q)->where('value', $value)),
            'starts_with' => $query->whereExists(fn ($q) => $has($q)->where('value', 'like', "{$like}%")),
            'ends_with' => $query->whereExists(fn ($q) => $has($q)->where('value', 'like', "%{$like}")),
            'not_contains' => $query->whereNotExists(fn ($q) => $has($q)->where('value', 'like', "%{$like}%")),
            default => $query->whereExists(fn ($q) => $has($q)->where('value', 'like', "%{$like}%")),
        };
    }
}
