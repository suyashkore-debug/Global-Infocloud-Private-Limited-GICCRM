<?php

namespace App\Http\Requests;

use App\Enums\ProposalStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

class ProposalRequest extends FormRequest
{
    use CompanyRules;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $document = InvoiceRequest::documentRules();
        // A proposal may be text only, without priced items.
        $document['items'] = ['nullable', 'array'];

        return [
            'subject' => ['required', 'string', 'max:500'],
            'content' => ['nullable', 'string', 'max:200000'],
            'customer_id' => ['nullable', 'integer', $this->existsInCompany('customers')],
            'lead_id' => ['nullable', 'integer', $this->existsInCompany('leads')],
            'project_id' => ['nullable', 'integer', $this->existsInCompany('projects')],
            'currency_id' => ['nullable', 'integer', $this->existsInCompany('currencies')],
            'proposal_to' => ['required_without_all:customer_id,lead_id', 'nullable', 'string', 'max:600'],
            'address' => ['nullable', 'string', 'max:200'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:50'],
            'country' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:50'],
            'date' => ['required', 'date'],
            'open_till' => ['nullable', 'date', 'after_or_equal:date'],
            'status' => ['nullable', Rule::enum(ProposalStatus::class)],
            'assigned_id' => ['nullable', 'integer', $this->staffMember()],
            'allow_comments' => ['boolean'],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
            'estimate_request_id' => ['nullable', 'integer', $this->existsInCompany('estimate_requests')],
            ...Arr::except($document, ['client_note', 'admin_note', 'terms']),
        ];
    }
}
