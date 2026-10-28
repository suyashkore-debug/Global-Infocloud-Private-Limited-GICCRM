<?php

namespace App\Http\Controllers\Api;

use App\Enums\EstimateStatus;
use App\Enums\ProposalStatus;
use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\CreditNote;
use App\Models\EmailLog;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Proposal;
use App\Services\Emails;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Perfex "Send to Email" on invoices, estimates, proposals, credit notes and contracts: pick
 * the customer's contacts, add CC, optionally edit the template and attach the PDF.
 */
class DocumentEmailController extends Controller
{
    /** type => [model, contact e-mail flag, template, template when already sent] */
    private const TYPES = [
        'invoices' => [Invoice::class, 'invoice_emails', 'invoice-send-to-client', 'invoice-already-send'],
        'estimates' => [Estimate::class, 'estimate_emails', 'estimate-send-to-client', 'estimate-already-send'],
        'proposals' => [Proposal::class, null, 'proposal-send-to-customer', null],
        'credit-notes' => [CreditNote::class, 'credit_note_emails', 'credit-note-send-to-client', null],
        'contracts' => [Contract::class, 'contract_emails', 'send-contract', null],
    ];

    /**
     * The recipients to choose from and the template to start with.
     */
    public function preview(Request $request, string $type, int $id): JsonResponse
    {
        [$document, $flag, $slug] = $this->document($type, $id);
        $template = Emails::template($slug, (int) $document->company_id);

        return response()->json(['data' => [
            'recipients' => $this->recipients($document, $flag)->values(),
            'template' => ['slug' => $slug, 'name' => $template?->name, 'subject' => $template?->subject, 'message' => $template?->message, 'active' => $template?->active],
            'already_sent' => (bool) $document->getAttribute('sent'),
            'logs' => EmailLog::where('rel_type', strtolower(class_basename($document)))->where('rel_id', $document->getKey())->latest('id')->limit(10)
                ->get(['id', 'to', 'subject', 'status', 'error', 'created_at']),
        ]]);
    }

    public function send(Request $request, string $type, int $id): JsonResponse
    {
        [$document, $flag, $slug] = $this->document($type, $id);
        $data = $request->validate([
            'recipients' => ['required', 'array', 'min:1', 'max:50'],
            'recipients.*' => ['required', 'email'],
            'cc' => ['nullable', 'string', 'max:1000'],
            'attach_pdf' => ['boolean'],
            'subject' => ['nullable', 'string', 'max:500'],
            'message' => ['nullable', 'string', 'max:200000'],
        ]);
        $company = (int) $document->company_id;
        $cc = array_values(array_filter(array_map('trim', preg_split('/[,;\s]+/', (string) ($data['cc'] ?? ''))), fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));
        $attachments = ($data['attach_pdf'] ?? true) ? [SalesPdf::attachment($document)] : [];
        $documentFields = $this->fields($document);
        $contacts = $this->recipients($document, $flag)->keyBy('email');

        foreach (array_unique(array_map('strtolower', $data['recipients'])) as $email) {
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
        $this->markSent($document);

        return response()->json(['message' => 'E-mail sent to '.count(array_unique($data['recipients'])).' recipient(s).']);
    }

    /**
     * @return array{0: Model, 1: ?string, 2: string}
     */
    private function document(string $type, int $id): array
    {
        abort_unless(isset(self::TYPES[$type]), 404);
        [$class, $flag, $slug, $alreadySlug] = self::TYPES[$type];
        $document = $class::findOrFail($id);
        $this->authorize('view', $document);
        if ($alreadySlug && $document->getAttribute('sent')) {
            $slug = $alreadySlug;
        }

        return [$document, $flag, $slug];
    }

    /**
     * The customer's active contacts (ticked when they get this kind of e-mail), or the
     * proposal's own e-mail for a proposal to a lead.
     *
     * @return Collection<int, array{contact_id: ?int, name: string, email: string, checked: bool}>
     */
    private function recipients(Model $document, ?string $flag): Collection
    {
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
     * @return array<string, string|null>
     */
    private function fields(Model $document): array
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

    private function markSent(Model $document): void
    {
        match (true) {
            $document instanceof Invoice => $document->update(['sent' => true, 'sent_at' => now()]),
            $document instanceof Estimate => $document->update(['sent' => true, 'sent_at' => now(), 'status' => $document->status === EstimateStatus::Draft ? EstimateStatus::Sent : $document->status]),
            $document instanceof Proposal => $document->status === ProposalStatus::Draft || $document->status === ProposalStatus::Open ? $document->update(['status' => ProposalStatus::Sent]) : null,
            default => null,
        };
    }
}
