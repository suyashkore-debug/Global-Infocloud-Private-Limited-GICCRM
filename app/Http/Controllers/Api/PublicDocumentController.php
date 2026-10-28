<?php

namespace App\Http\Controllers\Api;

use App\Enums\EstimateStatus;
use App\Enums\InvoiceStatus;
use App\Enums\ProposalStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\ContractResource;
use App\Http\Resources\EstimateResource;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\ProposalResource;
use App\Models\Contract;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Proposal;
use App\Services\Emails;
use App\Services\Notifier;
use App\Services\Options;
use App\Services\SalesPdf;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * The customer's view of a document from an e-mail link (Perfex invoice/estimate/proposal/
 * contract pages): no login, found by id + hash. Customers can download the PDF, accept or
 * decline an estimate / proposal and sign a contract.
 */
class PublicDocumentController extends Controller
{
    private const TYPES = ['invoice' => Invoice::class, 'estimate' => Estimate::class, 'proposal' => Proposal::class, 'contract' => Contract::class];

    public function show(Request $request, string $type, int $id, string $hash): JsonResponse
    {
        $document = $this->find($type, $id, $hash);
        $company = (int) $document->company_id;

        $data = match (true) {
            $document instanceof Invoice => (new InvoiceResource($document->load(['customer', 'currency', 'items.taxes', 'payments.paymentMode'])))->resolve($request),
            $document instanceof Estimate => (new EstimateResource($document->load(['customer', 'currency', 'items.taxes'])))->resolve($request),
            $document instanceof Proposal => (new ProposalResource($document->load(['customer', 'currency', 'items.taxes'])))->resolve($request),
            $document instanceof Contract => (new ContractResource($document->load(['customer', 'type'])))->resolve($request),
        };
        // Staff-only details never leave the app.
        foreach (['admin_note', 'can', 'tags', 'sale_agent', 'created_by', 'assigned', 'comments', 'renewals', 'attachments', 'project', 'lead', 'invoice', 'estimate'] as $key) {
            unset($data[$key]);
        }

        return response()->json(['data' => [
            'type' => $type,
            'document' => $data,
            'company' => [
                ...collect(Options::all($company))->only(['company_address', 'company_city', 'company_state', 'company_zip', 'company_country', 'company_phone', 'company_vat'])->all(),
                'company_name' => Options::companyName($company),
            ],
            'actions' => [
                'respond' => $this->canRespond($document),
                'sign' => $document instanceof Contract && ! $document->signed && ! $document->marked_as_signed,
            ],
        ]]);
    }

    public function pdf(string $type, int $id, string $hash): Response
    {
        $document = $this->find($type, $id, $hash);

        return match (true) {
            $document instanceof Invoice => SalesPdf::invoice($document, true),
            $document instanceof Estimate => SalesPdf::estimate($document, true),
            $document instanceof Proposal => SalesPdf::proposal($document, true),
            $document instanceof Contract => SalesPdf::contract($document, true),
        };
    }

    /**
     * Accept / decline an estimate or proposal, or sign a contract; the staff involved are told.
     */
    public function respond(Request $request, string $type, int $id, string $hash, Notifier $notifier): JsonResponse
    {
        $document = $this->find($type, $id, $hash);
        $data = $request->validate([
            'action' => ['required', Rule::in($document instanceof Contract ? ['sign'] : ['accept', 'decline'])],
            'signer_name' => [$document instanceof Contract ? 'required' : 'nullable', 'string', 'max:191'],
        ]);
        $company = (int) $document->company_id;
        $accepted = $data['action'] === 'accept';

        if ($document instanceof Contract) {
            abort_if($document->signed || $document->marked_as_signed, 422, 'This contract is already signed.');
            $document->update(['signed' => true, 'signer_name' => $data['signer_name'], 'signed_at' => now()]);
            $staff = [$document->created_by];
            $notifier->notify($staff, "Customer signed contract {$document->subject}", "/contracts/{$document->id}", $company);
            Emails::toStaff('contract-signed-to-staff', $company, $staff, Emails::contract($document), $document);

            return response()->json(['message' => 'Thank you, the contract is signed.']);
        }

        abort_unless($this->canRespond($document), 422, 'This document can no longer be accepted or declined.');

        if ($document instanceof Estimate) {
            $document->update(['status' => $accepted ? EstimateStatus::Accepted : EstimateStatus::Declined]);
            $staff = array_filter([$document->created_by, $document->sale_agent_id]);
            $fields = Emails::estimate($document->load('currency', 'customer'));
            $label = $document->formattedNumber();
            $notifier->notify($staff, ($accepted ? 'Customer accepted estimate ' : 'Customer declined estimate ').$label, "/estimates/{$document->id}", $company);
            Emails::toStaff($accepted ? 'estimate-accepted-to-staff' : 'estimate-declined-to-staff', $company, $staff, $fields, $document);
            if ($accepted && ($contact = $document->customer?->primaryContact)) {
                Emails::send('estimate-thank-you-to-customer', $company, (string) $contact->email, [...$fields, ...Emails::contact($contact)], ['rel' => $document]);
            }
        } else {
            /** @var Proposal $document */
            $document->update(['status' => $accepted ? ProposalStatus::Accepted : ProposalStatus::Declined]);
            $staff = array_filter([$document->created_by, $document->assigned_id]);
            $fields = Emails::proposal($document->load('currency'));
            $notifier->notify($staff, ($accepted ? 'Customer accepted proposal ' : 'Customer declined proposal ').$document->formattedNumber(), "/proposals/{$document->id}", $company);
            Emails::toStaff($accepted ? 'proposal-client-accepted' : 'proposal-client-declined', $company, $staff, $fields, $document);
            if ($accepted && $document->email) {
                Emails::send('proposal-client-thank-you', $company, $document->email, $fields, ['rel' => $document]);
            }
        }

        return response()->json(['message' => $accepted ? 'Thank you for accepting.' : 'You declined this document. We will be in touch.']);
    }

    private function find(string $type, int $id, string $hash): Model
    {
        abort_unless(isset(self::TYPES[$type]), 404);
        $document = self::TYPES[$type]::withoutGlobalScopes()->whereKey($id)->where('hash', $hash)->firstOrFail();
        // Drafts are not shown to customers; a trashed or hidden contract neither.
        abort_if($document instanceof Invoice && $document->status === InvoiceStatus::Draft, 404);
        abort_if($document instanceof Contract && ($document->trash || $document->not_visible_to_client), 404);

        return $document;
    }

    private function canRespond(Model $document): bool
    {
        return match (true) {
            $document instanceof Estimate => in_array($document->status, [EstimateStatus::Draft, EstimateStatus::Sent], true) && ! $document->invoice_id,
            $document instanceof Proposal => in_array($document->status, [ProposalStatus::Open, ProposalStatus::Sent, ProposalStatus::Revised], true),
            default => false,
        };
    }
}
