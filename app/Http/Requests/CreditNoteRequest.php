<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreditNoteRequest extends FormRequest
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
            'reference_no' => ['nullable', 'string', 'max:100'],
            'show_shipping' => ['boolean'],
            ...InvoiceRequest::documentRules(),
        ];
    }
}
