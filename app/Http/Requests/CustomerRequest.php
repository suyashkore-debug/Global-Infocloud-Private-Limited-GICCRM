<?php

namespace App\Http\Requests;

use App\Models\Customer;
use App\Support\TaxNumber;
use Illuminate\Foundation\Http\FormRequest;

class CustomerRequest extends FormRequest
{
    use CompanyRules;

    public function authorize(): bool
    {
        return true;
    }

    /** Tax numbers are stored upper case without spaces; an Indian customer's PAN comes from its GSTIN when left empty. */
    protected function prepareForValidation(): void
    {
        $vat = TaxNumber::normalize($this->input('vat'));
        $pan = TaxNumber::normalize($this->input('company_pan'));
        if ($pan === null && TaxNumber::hasPan($this->input('country'))) {
            $pan = TaxNumber::panFromGstin($vat);
        }
        $this->merge(['vat' => $vat, 'company_pan' => $pan]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // The tax number in the customer's country's format (its own, else the company's country).
        // An unchanged number saved before these checks is kept as it is.
        $customer = $this->route('customer');
        $country = $this->input('country');
        $checkVat = ! ($customer instanceof Customer && TaxNumber::normalize($customer->vat) === $this->input('vat') && $customer->country === $country);
        $checkPan = ! ($customer instanceof Customer && TaxNumber::normalize($customer->company_pan) === $this->input('company_pan') && $customer->country === $country);

        return [
            'name' => ['required', 'string', 'max:255'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'website' => ['nullable', 'string', 'max:255'],
            'vat' => ['nullable', 'string', 'max:50', ...($checkVat ? [TaxNumber::rule($country)] : [])],
            'address' => ['nullable', 'string', 'max:2000'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
            'is_active' => ['boolean'],
            'company_pan' => ['nullable', 'string', 'max:20', ...($checkPan ? [TaxNumber::panRule($country, $this->input('vat'))] : [])],
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
