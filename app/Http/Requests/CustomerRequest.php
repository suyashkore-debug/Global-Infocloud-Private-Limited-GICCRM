<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CustomerRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'website' => ['nullable', 'string', 'max:255'],
            'vat' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:2000'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
            'is_active' => ['boolean'],
            'company_pan' => ['nullable', 'string', 'max:20'],
            'gst_type' => ['nullable', 'string', 'max:20'],
            'default_currency_id' => ['nullable', 'integer', $this->existsInCompany('currencies')],
            'billing_street' => ['nullable', 'string', 'max:200'],
            'billing_city' => ['nullable', 'string', 'max:100'],
            'billing_state' => ['nullable', 'string', 'max:100'],
            'billing_zip' => ['nullable', 'string', 'max:100'],
            'billing_country' => ['nullable', 'string', 'max:100'],
            'shipping_street' => ['nullable', 'string', 'max:200'],
            'shipping_city' => ['nullable', 'string', 'max:100'],
            'shipping_state' => ['nullable', 'string', 'max:100'],
            'shipping_zip' => ['nullable', 'string', 'max:100'],
            'shipping_country' => ['nullable', 'string', 'max:100'],
            'groups' => ['array'],
            'groups.*' => ['integer', $this->existsInCompany('customer_groups')],
            'admins' => ['array'],
            'admins.*' => ['integer', $this->staffMember()],
            // A new customer can get its primary contact in the same form, as in Perfex.
            'contact' => ['nullable', 'array'],
            'contact.first_name' => ['required_with:contact.email', 'nullable', 'string', 'max:191'],
            'contact.last_name' => ['nullable', 'string', 'max:191'],
            'contact.email' => ['required_with:contact.first_name', 'nullable', 'email', 'max:191'],
            'contact.phone' => ['nullable', 'string', 'max:100'],
            'contact.title' => ['nullable', 'string', 'max:200'],
        ];
    }
}
