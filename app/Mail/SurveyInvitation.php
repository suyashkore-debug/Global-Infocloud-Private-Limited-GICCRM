<?php

namespace App\Mail;

use App\Models\Survey;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The survey e-mail: the survey's description and the link to take part.
 */
class SurveyInvitation extends Mailable
{
    public function __construct(public Survey $survey) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address((string) config('mail.from.address'), $this->survey->from_name ?: (string) config('mail.from.name')),
            subject: $this->survey->subject,
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.survey', with: ['survey' => $this->survey, 'url' => $this->survey->publicUrl()]);
    }
}
