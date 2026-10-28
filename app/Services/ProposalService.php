<?php

namespace App\Services;

use App\Enums\EstimateStatus;
use App\Enums\ProposalStatus;
use App\Models\Currency;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\PaymentMode;
use App\Models\Proposal;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Proposals as Perfex handles them: content plus priced items for a customer, statuses from draft
 * to accepted, and conversion into an estimate or an invoice.
 */
class ProposalService
{
    private const FIELDS = [
        'subject', 'content', 'customer_id', 'lead_id', 'project_id', 'currency_id', 'proposal_to', 'address', 'city', 'state', 'zip',
        'country', 'email', 'phone', 'date', 'open_till', 'status', 'assigned_id', 'allow_comments', 'show_quantity_as',
    ];

    public function __construct(private InvoiceService $invoices, private EstimateService $estimates) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Proposal
    {
        return DB::transaction(function () use ($data) {
            $proposal = new Proposal([
                ...$this->fields($data),
                'status' => $data['status'] ?? ProposalStatus::Draft,
                'hash' => Str::random(32),
                'created_by' => Auth::id(),
            ]);
            $proposal->save();
            SalesItemsWriter::write($proposal, $data['items'] ?? [], $data);
            $proposal->syncTagNames($data['tags'] ?? []);

            return $proposal;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Proposal $proposal, array $data): Proposal
    {
        return DB::transaction(function () use ($proposal, $data) {
            $proposal->update($this->fields($data));
            SalesItemsWriter::write($proposal, $data['items'] ?? [], $data);
            if (array_key_exists('tags', $data)) {
                $proposal->syncTagNames($data['tags'] ?? []);
            }

            return $proposal;
        });
    }

    public function markStatus(Proposal $proposal, ProposalStatus $status): void
    {
        $proposal->update(['status' => $status]);
    }

    public function convertToEstimate(Proposal $proposal): Estimate
    {
        $this->ensureConvertible($proposal);

        return DB::transaction(function () use ($proposal) {
            $date = today()->toDateString();
            $estimate = $this->estimates->create([
                ...$this->documentBase($proposal),
                'date' => $date,
                'expiry_date' => $this->estimates->defaultExpiryDate($date),
                'status' => EstimateStatus::Draft,
                'terms' => Options::get('predefined_terms_estimate'),
                'client_note' => Options::get('predefined_clientnote_estimate'),
            ]);
            $proposal->update(['estimate_id' => $estimate->id, 'converted_at' => now(), 'status' => ProposalStatus::Accepted]);

            return $estimate;
        });
    }

    public function convertToInvoice(Proposal $proposal): Invoice
    {
        $this->ensureConvertible($proposal);

        return DB::transaction(function () use ($proposal) {
            $date = today()->toDateString();
            $invoice = $this->invoices->create([
                ...$this->documentBase($proposal),
                'date' => $date,
                'due_date' => $this->invoices->defaultDueDate($date),
                'terms' => Options::get('predefined_terms_invoice'),
                'client_note' => Options::get('predefined_clientnote_invoice'),
                'allowed_payment_modes' => PaymentMode::where('active', true)->where('expenses_only', false)->where('selected_by_default', true)->pluck('id')->all(),
            ]);
            $proposal->update(['invoice_id' => $invoice->id, 'converted_at' => now(), 'status' => ProposalStatus::Accepted]);

            return $invoice;
        });
    }

    public function copy(Proposal $source): Proposal
    {
        return $this->create([
            ...$source->only(self::FIELDS),
            ...SalesDocuments::moneyOf($source),
            'date' => today()->toDateString(),
            'status' => ProposalStatus::Draft,
            'items' => SalesDocuments::itemsOf($source),
            'tags' => $source->tags()->pluck('name')->all(),
        ]);
    }

    private function ensureConvertible(Proposal $proposal): void
    {
        if (! $proposal->customer_id) {
            throw ValidationException::withMessages(['customer_id' => 'Link the proposal to a customer before converting it.']);
        }
        if ($proposal->estimate_id || $proposal->invoice_id) {
            throw ValidationException::withMessages(['proposal' => 'This proposal is already converted.']);
        }
        if ($proposal->items()->doesntExist()) {
            throw ValidationException::withMessages(['items' => 'The proposal has no items to convert.']);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function documentBase(Proposal $proposal): array
    {
        return [
            'customer_id' => $proposal->customer_id,
            'project_id' => $proposal->project_id,
            'currency_id' => $proposal->currency_id,
            'sale_agent_id' => $proposal->assigned_id,
            ...SalesDocuments::moneyOf($proposal),
            'items' => SalesDocuments::itemsOf($proposal),
            'tags' => $proposal->tags()->pluck('name')->all(),
        ];
    }

    /**
     * Perfex fills "To" and the address from the customer when they are left empty.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function fields(array $data): array
    {
        $fields = Arr::only($data, self::FIELDS);
        if (! empty($fields['customer_id']) && ($customer = Customer::with('primaryContact')->find($fields['customer_id']))) {
            $fields['proposal_to'] = ($fields['proposal_to'] ?? null) ?: $customer->name;
            $fields['address'] = ($fields['address'] ?? null) ?: ($customer->billing_street ?: $customer->address);
            $fields['city'] = ($fields['city'] ?? null) ?: ($customer->billing_city ?: $customer->city);
            $fields['state'] = ($fields['state'] ?? null) ?: ($customer->billing_state ?: $customer->state);
            $fields['zip'] = ($fields['zip'] ?? null) ?: ($customer->billing_zip ?: $customer->zip);
            $fields['country'] = ($fields['country'] ?? null) ?: ($customer->billing_country ?: $customer->country);
            $fields['email'] = ($fields['email'] ?? null) ?: ($customer->primaryContact?->email ?? $customer->email);
            $fields['phone'] = ($fields['phone'] ?? null) ?: ($customer->primaryContact?->phone ?? $customer->phone);
            $fields['currency_id'] ??= $customer->default_currency_id;
        }
        $fields['currency_id'] ??= Currency::default()->id;

        return $fields;
    }
}
