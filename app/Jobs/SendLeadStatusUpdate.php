<?php

namespace App\Jobs;

use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\User;
use App\Services\LeadStatusMessages;
use App\Support\Workspace;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * The status-update e-mail and WhatsApp message to a lead, sent a couple of minutes after the
 * change (see LeadStatusMessages), in the background so the kanban and bulk actions never wait.
 */
class SendLeadStatusUpdate implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $leadId, public int $statusId, public int $userId, public string $token) {}

    public function handle(LeadStatusMessages $messages): void
    {
        $lead = Lead::withoutGlobalScopes()->find($this->leadId);
        $user = User::withoutGlobalScopes()->find($this->userId);
        $status = LeadStatus::withoutGlobalScopes()->find($this->statusId);
        if ($lead && $user && $status) {
            // With the settings of the lead's workspace (its e-mail account, WhatsApp number, texts).
            Workspace::withSettingsOf($lead, fn () => $messages->deliver($lead, $status, $user, $this->token));
        }
    }
}
