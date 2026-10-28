<?php

namespace App\Mail;

use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * An e-mail built from a template: the subject and HTML are already merged.
 */
class TemplateMail extends Mailable
{
    /**
     * @param  array<int, array{name: string, mime: string, data: string}>  $files  base64 data
     */
    public function __construct(
        public string $mailSubject,
        public string $body,
        public string $fromAddress,
        public string $fromName,
        public array $files = [],
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(from: new Address($this->fromAddress, $this->fromName), subject: $this->mailSubject);
    }

    public function content(): Content
    {
        return new Content(htmlString: $this->body);
    }

    /**
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return array_map(fn ($f) => Attachment::fromData(fn () => base64_decode($f['data']), $f['name'])->withMime($f['mime']), $this->files);
    }
}
