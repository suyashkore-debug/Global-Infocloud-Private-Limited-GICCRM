<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\Contract;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Contracts as Perfex handles them: renewals keep the history of dates and value, signing can be
 * marked by staff, trash hides them, and the creator is told before a contract ends.
 */
class ContractService
{
    private const FIELDS = [
        'subject', 'description', 'content', 'customer_id', 'contract_type_id', 'project_id', 'start_date', 'end_date',
        'contract_value', 'trash', 'not_visible_to_client',
    ];

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Contract
    {
        return Contract::create([...Arr::only($data, self::FIELDS), 'hash' => Str::random(32), 'created_by' => Auth::id()]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Contract $contract, array $data): Contract
    {
        $fields = Arr::only($data, self::FIELDS);
        // A new end date means a new expiry reminder.
        if (array_key_exists('end_date', $fields) && (string) $fields['end_date'] !== (string) $contract->end_date?->toDateString()) {
            $fields['expiry_notified'] = false;
        }
        $contract->update($fields);

        return $contract;
    }

    /**
     * @param  array{new_start_date: string, new_end_date?: string|null, new_value?: float|int|string|null}  $data
     */
    public function renew(Contract $contract, array $data): Contract
    {
        return DB::transaction(function () use ($contract, $data) {
            $contract->renewals()->create([
                'old_start_date' => $contract->start_date,
                'new_start_date' => $data['new_start_date'],
                'old_end_date' => $contract->end_date,
                'new_end_date' => $data['new_end_date'] ?? null,
                'old_value' => $contract->contract_value,
                'new_value' => $data['new_value'] ?? $contract->contract_value,
                'renewed_by' => Auth::id(),
            ]);
            $contract->update([
                'start_date' => $data['new_start_date'],
                'end_date' => $data['new_end_date'] ?? null,
                'contract_value' => $data['new_value'] ?? $contract->contract_value,
                'expiry_notified' => false,
                // Perfex: a renewed contract has to be signed again.
                'signed' => false,
                'marked_as_signed' => false,
                'signed_at' => null,
                'signer_name' => null,
            ]);

            return $contract;
        });
    }

    public function markSigned(Contract $contract, bool $signed): void
    {
        $contract->update([
            'marked_as_signed' => $signed,
            'signed' => $signed,
            'signed_at' => $signed ? now() : null,
            'signer_name' => $signed ? Auth::user()?->full_name : null,
        ]);
    }

    public function copy(Contract $source): Contract
    {
        return $this->create([
            ...$source->only(self::FIELDS),
            'subject' => $source->subject,
            'start_date' => today()->toDateString(),
            'end_date' => $source->end_date && $source->start_date
                ? CarbonImmutable::today()->addDays((int) $source->start_date->diffInDays($source->end_date))->toDateString()
                : null,
            'trash' => false,
        ]);
    }

    /**
     * Daily: tell each creator about their contracts ending within the configured days (Perfex cron).
     */
    public function notifyExpiring(): int
    {
        $count = 0;
        Contract::withoutGlobalScopes()
            ->where('trash', false)
            ->where('expiry_notified', false)
            ->whereNotNull('end_date')
            ->whereDate('end_date', '>=', today())
            ->each(function (Contract $contract) use (&$count) {
                $days = (int) Options::get('contract_expiration_before', $contract->company_id);
                if ($contract->end_date->gt(today()->addDays($days))) {
                    return;
                }
                AppNotification::create([
                    'company_id' => $contract->company_id,
                    'user_id' => $contract->created_by,
                    'description' => "contract {$contract->subject} ends on {$contract->end_date->format('d-m-Y')}",
                    'link' => "/contracts/{$contract->id}",
                ]);
                // Perfex also e-mails the creator and the customer's contacts.
                $fields = Emails::contract($contract);
                if ($creator = User::find($contract->created_by)) {
                    Emails::send('contract-expiration-to-staff', (int) $contract->company_id, (string) $creator->email, [...$fields, ...Emails::staff($creator)], ['rel' => $contract]);
                }
                if (! $contract->not_visible_to_client && $contract->customer) {
                    foreach ($contract->customer->contacts()->where('active', true)->where('contract_emails', true)->get() as $contact) {
                        Emails::send('contract-expiration', (int) $contract->company_id, (string) $contact->email, [...$fields, ...Emails::contact($contact)], ['rel' => $contract]);
                    }
                }
                $contract->update(['expiry_notified' => true]);
                $count++;
            });

        return $count;
    }
}
