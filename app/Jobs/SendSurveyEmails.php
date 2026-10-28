<?php

namespace App\Jobs;

use App\Mail\SurveyInvitation;
use App\Models\Survey;
use App\Models\SurveySendLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Sends a survey to a list of e-mail addresses in the background (Perfex sends them by cron),
 * counting progress on the send log.
 */
class SendSurveyEmails implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, string>  $emails
     */
    public function __construct(public int $surveyId, public int $logId, public array $emails) {}

    public function handle(): void
    {
        $survey = Survey::withoutGlobalScopes()->find($this->surveyId);
        $log = SurveySendLog::find($this->logId);
        if (! $survey || ! $log) {
            return;
        }

        foreach ($this->emails as $email) {
            try {
                Mail::to($email)->send(new SurveyInvitation($survey));
                $log->increment('sent');
            } catch (Throwable $e) {
                Log::warning("Survey {$survey->id} e-mail to {$email} failed: {$e->getMessage()}");
            }
        }

        $log->update(['finished' => true]);
    }
}
