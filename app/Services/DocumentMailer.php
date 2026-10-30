<?php

namespace App\Services;

use App\Enums\EstimateStatus;
use App\Enums\ProposalStatus;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\CreditNote;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Proposal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * Perfex "Send to Email" for invoices, estimates, proposals, credit notes and contracts: e-mails
 * the chosen recipients now (the dialog) or later (a scheduled e-mail).
 */
class DocumentMailer
{
    /** type => [model, contact e-mail flag, template, template when already sent] */
    public const TYPES = [
        'invoices' => [Invoice::class, 'invoice_emails', 'invoice-send-to-client', 'invoice-already-send'],
        'estimates' => [Estimate::class, 'estimate_emails', 'estimate-send-to-client', 'estimate-already-send'],
        'proposals' => [Proposal::class, null, 'proposal-send-to-customer', null],
        'credit-notes' => [CreditNote::class, 'credit_note_emails', 'credit-note-send-to-client', null],
        'contracts' => [Contract::class, 'contract_emails', 'send-contract', null],
    ];

    /** Types whose e-mail can be scheduled, as in Perfex. */
    public const SCHEDULABLE = ['invoices', 'estimates'];

    /** The template the document's e-mail uses now (the "already sent" one after the first send). */
    public static function slug(string $type, Model $document): string
    {
        [, , $slug, $alreadySlug] = self::TYPES[$type];

        return $alreadySlug && $document->getAttribute('sent') ? $alreadySlug : $slug;
    }

    /**
     * The customer's active contacts (ticked when they get this kind of e-mail), or the
     * proposal's own e-mail for a proposal to a lead.
     *
     * @return Collection<int, array{contact_id: ?int, name: string, email: string, checked: bool}>
     */
    public static function recipients(string $type, Model $document): Collection
    {
        $flag = self::TYPES[$type][1];
        $customer = $document->getAttribute('customer_id') ? $document->customer : null;
        $list = collect();
        if ($customer) {
            $list = $customer->contacts()->where('active', true)->orderByDesc('is_primary')->get()
                ->map(fn (Contact $c) => ['contact_id' => $c->id, 'name' => $c->fullName(), 'email' => strtolower((string) $c->email), 'checked' => $flag ? (bool) $c->getAttribute($flag) : (bool) $c->is_primary]);
        }
        if ($document instanceof Proposal && $document->email && ! $list->contains('email', strtolower($document->email))) {
            $list->prepend(['contact_id' => null, 'name' => (string) $document->proposal_to, 'email' => strtolower($document->email), 'checked' => true]);
        }

        return $list->filter(fn ($r) => filter_var($r['email'], FILTER_VALIDATE_EMAIL));
    }

    /**
     * Sends the e-mail to each recipient (CC on the first only) and marks the document sent.
     *
     * @param  array{recipients: array<int, string>, cc?: ?string, attach_pdf?: bool, subject?: ?string, message?: ?string}  $data
     * @return int how many recipients
     */
    public static function deliver(string $type, Model $document, array $data): int
    {
        $slug = self::slug($type, $document);
        $company = (int) $document->company_id;
        $cc = array_values(array_filter(array_map('trim', preg_split('/[,;\s]+/', (string) ($data['cc'] ?? ''))), fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));
        $attachments = ($data['attach_pdf'] ?? true) ? [SalesPdf::attachment($document)] : [];
        $documentFields = self::fields($document);
        $contacts = self::recipients($type, $document)->keyBy('email');
        $emails = array_values(array_unique(array_map('strtolower', $data['recipients'])));

        foreach ($emails as $email) {
            $contact = isset($contacts[$email]['contact_id']) ? Contact::find($contacts[$email]['contact_id']) : null;
            Emails::send($slug, $company, $email, [...$documentFields, ...Emails::contact($contact), 'contact_email' => $email], [
                'cc' => $cc,
                'attachments' => $attachments,
                'subject' => $data['subject'] ?? null,
                'message' => $data['message'] ?? null,
                'rel' => $document,
                'force' => true,
            ]);
            $cc = []; // CC only once
        }
        self::markSent($document);
        if ($document instanceof Proposal) {
            $document->lead?->logActivity('Emailed proposal '.$document->formattedNumber().' to '.implode(', ', $emails));
        }

        return count($emails);
    }

    /**
     * @return array<string, string|null>
     */
    private static function fields(Model $document): array
    {
        if (method_exists($document, 'currency')) {
            $document->loadMissing('currency');
        }

        return match (true) {
            $document instanceof Invoice => Emails::invoice($document),
            $document instanceof Estimate => Emails::estimate($document),
            $document instanceof Proposal => Emails::proposal($document),
            $document instanceof CreditNote => Emails::creditNote($document),
            $document instanceof Contract => Emails::contract($document),
        };
    }

    private static function markSent(Model $document): void
    {
        match (true) {
            $document instanceof Invoice => $document->update(['sent' => true, 'sent_at' => now()]),
            $document instanceof Estimate => $document->update(['sent' => true, 'sent_at' => now(), 'status' => $document->status === EstimateStatus::Draft ? EstimateStatus::Sent : $document->status]),
            $document instanceof Proposal => $document->status === ProposalStatus::Draft || $document->status === ProposalStatus::Open ? $document->update(['status' => ProposalStatus::Sent]) : null,
            default => null,
        };
    }
}
