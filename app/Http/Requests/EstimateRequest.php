<?php

namespace App\Http\Requests;

use App\Enums\EstimateStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class EstimateRequest extends FormRequest
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
        return [
            'customer_id' => ['required', 'integer', $this->existsInCompany('customers')],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('company_id', $this->companyId())->where('customer_id', $this->input('customer_id'))],
            'currency_id' => ['nullable', 'integer', $this->existsInCompany('currencies')],
            'date' => ['required', 'date'],
            'expiry_date' => ['nullable', 'date', 'after_or_equal:date'],
            'status' => ['nullable', Rule::enum(EstimateStatus::class)],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'sale_agent_id' => ['nullable', 'integer', $this->staffMember()],
            'show_shipping' => ['boolean'],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
            'estimate_request_id' => ['nullable', 'integer', $this->existsInCompany('estimate_requests')],
            ...InvoiceRequest::documentRules(),
        ];
    }
}
