<?php

namespace App\Console\Commands;

use App\Models\ScheduledEmail;
use App\Services\DocumentMailer;
use Illuminate\Console\Command;
use Throwable;

/**
 * Sends the invoice and estimate e-mails whose scheduled time has come (runs every minute), as
 * Perfex's cron does; each is removed once handled.
 */
class SendScheduledEmails extends Command
{
    protected $signature = 'emails:send-scheduled';

    protected $description = 'Send scheduled invoice and estimate e-mails that are due';

    public function handle(): int
    {
        ScheduledEmail::withoutGlobalScopes()->where('scheduled_at', '<=', now())->orderBy('scheduled_at')->each(function (ScheduledEmail $email) {
            // Work as the e-mail's company (company scopes, options) while sending it.
            request()->attributes->set('portal_company_id', $email->company_id);
            try {
                $class = DocumentMailer::TYPES[$email->rel_type][0] ?? null;
                $document = $class ? $class::find($email->rel_id) : null;
                if ($document) {
                    DocumentMailer::deliver($email->rel_type, $document, $email->only(['recipients', 'cc', 'attach_pdf', 'subject', 'message']));
                }
            } catch (Throwable $e) {
                report($e);
            } finally {
                $email->delete();
                request()->attributes->remove('portal_company_id');
            }
        });

        return self::SUCCESS;
    }
}
