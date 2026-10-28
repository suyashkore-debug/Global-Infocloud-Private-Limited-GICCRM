<?php

namespace App\Jobs;

use App\Mail\TemplateMail;
use App\Models\EmailLog;
use App\Services\CompanyMailer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Sends one already-rendered template e-mail through the company's SMTP account and records
 * the outcome on its log row.
 */
class SendTemplateEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    /**
     * @param  array<int, string>  $to
     * @param  array<int, string>  $cc
     * @param  array<int, array{name: string, mime: string, data: string}>  $files
     */
    public function __construct(
        public int $companyId,
        public int $logId,
        public array $to,
        public array $cc,
        public string $subject,
        public string $html,
        public string $fromAddress,
        public string $fromName,
        public array $files = [],
    ) {}

    public function handle(): void
    {
        $log = EmailLog::withoutGlobalScopes()->find($this->logId);
        try {
            $pending = CompanyMailer::mailer($this->companyId)->to($this->to);
            if ($this->cc) {
                $pending->cc($this->cc);
            }
            $pending->send(new TemplateMail($this->subject, $this->html, $this->fromAddress, $this->fromName, $this->files));
            $log?->update(['status' => 'sent', 'error' => null]);
        } catch (Throwable $e) {
            $log?->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 2000)]);
            if ($this->attempts() < $this->tries) {
                throw $e;
            }
        }
    }
}
