<?php

namespace App\Services;

use App\Jobs\SendLeadStatusUpdate;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * When a lead's status changes (edit, kanban drop, bulk action): the lead's staff get a bell
 * notification at once, and — for statuses ticked in Setup → Leads — the lead gets the
 * "Lead status changed" e-mail and the WhatsApp message a little later (DELAY), so a card dropped
 * in the wrong column and moved back sends nothing. Only the last change of a quick series is
 * sent, and nothing when the lead ends up back where it started.
 */
class LeadStatusMessages
{
    public const DELAY_MINUTES = 2;

    public function __construct(private Notifier $notifier, private WhatsApp $whatsapp) {}

    public function changed(Lead $lead, ?User $by, ?int $fromStatusId): void
    {
        DB::afterCommit(fn () => $this->queue($lead->fresh() ?? $lead, $by, $fromStatusId));
    }

    private function queue(Lead $lead, ?User $by, ?int $fromStatusId): void
    {
        $company = (int) $lead->company_id;
        $status = LeadStatus::withoutGlobalScopes()->find($lead->lead_status_id);
        if (! $status) {
            return;
        }

        if (Options::get('lead_status_notify_staff', $company) === '1') {
            $this->notifier->notify(
                array_filter([$lead->assigned_id, $lead->created_by]),
                "changed the status of lead {$lead->name} to {$status->name}",
                "/leads?lead={$lead->id}",
                $company,
            );
        }

        // The pending change: the status before the first change of this series, and which
        // change is the latest (only that one is sent).
        $key = self::pendingKey($lead->id);
        $token = (string) Str::uuid();
        Cache::put($key, ['from' => Cache::get($key)['from'] ?? $fromStatusId, 'token' => $token], now()->addDay());

        if ($by && $status->notify_lead) {
            SendLeadStatusUpdate::dispatch($lead->id, $status->id, $by->id, $token)->delay(now()->addMinutes(self::DELAY_MINUTES));
        }
    }

    /**
     * Send the e-mail and WhatsApp message (from the queued job), if this is still the lead's
     * latest change and the lead really is in a new status.
     */
    public function deliver(Lead $lead, LeadStatus $status, User $by, string $token): void
    {
        $key = self::pendingKey($lead->id);
        $pending = Cache::get($key);
        if (! $pending || $pending['token'] !== $token) {
            return;
        }
        Cache::forget($key);

        $company = (int) $lead->company_id;
        if ((int) $lead->lead_status_id !== $status->id || (int) ($pending['from'] ?? 0) === $status->id
            || ! $status->notify_lead || $lead->customer_id || $lead->lost || $lead->junk) {
            return;
        }

        if (Options::get('lead_status_email_lead', $company) === '1' && $lead->email
            && Emails::send('lead-status-changed', $company, $lead->email, Emails::lead($lead), ['rel' => $lead, 'user_id' => $by->id])) {
            $lead->activities()->create(['user_id' => $by->id, 'description' => "Sent the status update e-mail ({$status->name})", 'custom' => false]);
        }

        if (Options::get('lead_status_whatsapp_lead', $company) === '1' && $lead->phone
            && WhatsApp::configured($company) && WhatsApp::normalize($lead->phone, $company)) {
            $this->whatsapp->sendStatusUpdate($lead, $status, $by);
        }
    }

    /**
     * The WhatsApp text for a lead, from Setup → Leads.
     */
    public static function whatsappText(Lead $lead): string
    {
        $company = (int) $lead->company_id;
        $fields = [...Emails::companyFields($company), ...Emails::lead($lead)];

        return trim(Emails::merge(Options::get('lead_status_whatsapp_message', $company), $fields, false));
    }

    private static function pendingKey(int $leadId): string
    {
        return "lead-status-pending:{$leadId}";
    }
}
