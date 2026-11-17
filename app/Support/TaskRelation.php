<?php

namespace App\Support;

use App\Models\Contract;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Proposal;
use App\Models\Task;
use App\Models\Ticket;
use App\Models\User;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * What a task can be "related to" besides a project or a lead (Perfex's rel_type): the record's
 * model, how it is named and where it opens. Its own company scope keeps other companies out.
 */
class TaskRelation
{
    /** type => [model, label] */
    public const TYPES = [
        'customer' => [Customer::class, 'Customer'],
        'invoice' => [Invoice::class, 'Invoice'],
        'estimate' => [Estimate::class, 'Estimate'],
        'proposal' => [Proposal::class, 'Proposal'],
        'contract' => [Contract::class, 'Contract'],
        'ticket' => [Ticket::class, 'Ticket'],
        'expense' => [Expense::class, 'Expense'],
    ];

    /** The record's own name: an invoice number, a contract subject, a customer name … */
    public static function name(string $type, Model $record): string
    {
        return match ($type) {
            'invoice', 'estimate' => $record->formattedNumber(),
            'proposal' => $record->formattedNumber().' · '.$record->subject,
            'contract' => (string) $record->subject,
            'ticket' => "#{$record->id} · {$record->subject}",
            'expense' => (string) ($record->name ?: 'Expense #'.$record->id),
            default => (string) $record->name,
        };
    }

    public static function url(string $type, int $id): string
    {
        return '/'.match ($type) {
            'customer' => 'customers',
            'invoice' => 'invoices',
            'estimate' => 'estimates',
            'proposal' => 'proposals',
            'contract' => 'contracts',
            'ticket' => 'tickets',
            'expense' => 'expenses',
        }.'/'.$id;
    }

    public static function find(?string $type, ?int $id): ?Model
    {
        if (! $type || ! $id || ! isset(self::TYPES[$type])) {
            return null;
        }

        return self::TYPES[$type][0]::query()->find($id);
    }

    /**
     * The task's related record, for the task modal and lists.
     *
     * @return array{type: string, type_label: string, id: int, name: string, url: string}|null
     */
    public static function describe(Task $task): ?array
    {
        $record = self::find($task->rel_type, $task->rel_id);

        return $record ? [
            'type' => $task->rel_type,
            'type_label' => self::TYPES[$task->rel_type][1],
            'id' => $record->id,
            'name' => self::name($task->rel_type, $record),
            'url' => self::url($task->rel_type, $record->id),
        ] : null;
    }

    /**
     * Records of a type to pick from (newest first, matching the search), only those the person may see.
     *
     * @return array<int, array{id: int, name: string}>
     */
    public static function options(string $type, string $search, User $user): array
    {
        $search = trim($search);
        $like = "%{$search}%";
        if ($type === 'lead') {
            return Lead::query()->latest('id')
                ->when($search !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w->where('name', 'like', $like)->orWhere('company', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)))
                ->limit(80)->get()
                ->filter(fn (Lead $lead) => $user->can('view', $lead))
                ->take(20)
                ->map(fn (Lead $lead) => ['id' => $lead->id, 'name' => trim($lead->name.($lead->company ? " · {$lead->company}" : ''))])
                ->values()->all();
        }
        $query = self::TYPES[$type][0]::query()->latest('id');
        if ($search !== '') {
            $query->where(fn (Builder $q) => match ($type) {
                'customer' => $q->where('name', 'like', $like),
                'invoice', 'estimate' => $q->where('number', 'like', $like)->orWhere('id', (int) $search),
                'proposal', 'contract' => $q->where('subject', 'like', $like)->orWhere('id', (int) $search),
                'ticket' => $q->where('subject', 'like', $like)->orWhere('id', (int) $search),
                'expense' => $q->where('name', 'like', $like)->orWhere('id', (int) $search),
            });
        }

        return $query->limit(80)->get()
            ->filter(fn (Model $record) => $user->can('view', $record))
            ->take(20)
            ->map(fn (Model $record) => ['id' => $record->id, 'name' => self::name($type, $record)])
            ->values()->all();
    }

    /** A validation rule: the related record exists in the company and the person may see it. */
    public static function rule(?string $type, User $user): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($type, $user) {
            $record = self::find($type, (int) $value);
            if (! $record || ! $user->can('view', $record)) {
                $fail('Choose a record you can open.');
            }
        };
    }
}
