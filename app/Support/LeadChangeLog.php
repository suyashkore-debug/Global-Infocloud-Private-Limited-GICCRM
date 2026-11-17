<?php

namespace App\Support;

use App\Models\Lead;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Turns a saved lead's changed fields into activity lines ("Phone changed from … to …"), so every
 * change shows on the lead's Activity Log whichever screen or job made it (edit form, bulk action,
 * kanban drag, import, web form, WhatsApp).
 */
class LeadChangeLog
{
    /** Fields shown by name; the rest (order, timestamps, links) are bookkeeping. */
    private const LABELS = [
        'name' => 'Name',
        'title' => 'Position',
        'company' => 'Company',
        'email' => 'Email',
        'phone' => 'Phone',
        'website' => 'Website',
        'address' => 'Address',
        'city' => 'City',
        'state' => 'State',
        'zip' => 'Zip Code',
        'country' => 'Country',
        'default_language' => 'Default Language',
        'lead_source_id' => 'Source',
        'lead_value' => 'Lead Value',
        'last_contact_at' => 'Last Contact',
        'is_public' => 'Public',
    ];

    /**
     * @return array<int, string>
     */
    public static function lines(Lead $lead): array
    {
        $changes = $lead->getChanges();
        $lines = [];

        if (array_key_exists('lead_status_id', $changes)) {
            $from = LeadStatus::find($lead->getOriginal('lead_status_id'))?->name ?? '—';
            $to = LeadStatus::find($lead->lead_status_id)?->name ?? '—';
            $lines[] = "Status changed from {$from} to {$to}";
        }
        if (array_key_exists('assigned_id', $changes)) {
            $from = self::staff($lead->getOriginal('assigned_id'));
            $lines[] = $lead->assigned_id ? 'Assigned to '.self::staff($lead->assigned_id).($from !== '—' ? " (was {$from})" : '') : "Unassigned (was {$from})";
        }
        foreach (['lost', 'junk'] as $flag) {
            if (array_key_exists($flag, $changes) && (bool) $lead->getOriginal($flag) !== (bool) $lead->{$flag}) {
                $lines[] = ($lead->{$flag} ? 'Marked as ' : 'Unmarked as ').$flag;
            }
        }
        if (array_key_exists('description', $changes)) {
            $lines[] = 'Description updated';
        }
        foreach (self::LABELS as $field => $label) {
            if (! array_key_exists($field, $changes)) {
                continue;
            }
            $from = self::value($field, $lead->getOriginal($field));
            $to = self::value($field, $lead->{$field});
            if ($from !== $to) {
                $lines[] = "{$label} changed from {$from} to {$to}";
            }
        }

        return $lines;
    }

    private static function staff(mixed $id): string
    {
        return $id ? (User::find($id)?->full_name ?? "#{$id}") : '—';
    }

    private static function value(string $field, mixed $value): string
    {
        if ($value === null || $value === '') {
            return '—';
        }

        return match ($field) {
            'lead_source_id' => LeadSource::find($value)?->name ?? "#{$value}",
            'is_public' => $value ? 'Yes' : 'No',
            'lead_value' => number_format((float) $value, 2),
            'last_contact_at' => Carbon::parse($value)->setTimezone(CompanyTime::zone())->format('d M Y, h:i A'),
            default => (string) $value,
        };
    }
}
