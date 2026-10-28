<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Invoice form, with its line items. Estimates, credit notes and proposals reuse itemRules().
 */
class InvoiceRequest extends FormRequest
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
            'due_date' => ['nullable', 'date', 'after_or_equal:date'],
            'sale_agent_id' => ['nullable', 'integer', $this->staffMember()],
            'allowed_payment_modes' => ['nullable', 'array'],
            'allowed_payment_modes.*' => ['integer', $this->existsInCompany('payment_modes')],
            'repeat_every' => ['nullable', 'integer', 'min:1', 'max:365'],
            'recurring_type' => ['nullable', 'required_with:repeat_every', Rule::in(['day', 'week', 'month', 'year'])],
            'cycles' => ['nullable', 'integer', 'min:0'],
            'cancel_overdue_reminders' => ['boolean'],
            'save_as_draft' => ['boolean'],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
            ...self::documentRules(),
            'show_shipping_on_invoice' => ['boolean'],
        ];
    }

    /**
     * Fields every sales document shares: addresses, notes, totals inputs and the line items.
     *
     * @return array<string, mixed>
     */
    public static function documentRules(): array
    {
        $address = [];
        foreach (['billing', 'shipping'] as $prefix) {
            $address["{$prefix}_street"] = ['nullable', 'string', 'max:200'];
            $address["{$prefix}_city"] = ['nullable', 'string', 'max:100'];
            $address["{$prefix}_state"] = ['nullable', 'string', 'max:100'];
            $address["{$prefix}_zip"] = ['nullable', 'string', 'max:100'];
            $address["{$prefix}_country"] = ['nullable', 'string', 'max:100'];
        }

        return [
            ...$address,
            'include_shipping' => ['boolean'],
            'show_quantity_as' => ['nullable', 'integer', 'in:1,2,3'],
            'client_note' => ['nullable', 'string', 'max:65000'],
            'admin_note' => ['nullable', 'string', 'max:65000'],
            'terms' => ['nullable', 'string', 'max:65000'],
            'discount_type' => ['nullable', Rule::in(['before_tax', 'after_tax'])],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_total' => ['nullable', 'numeric', 'min:0'],
            'adjustment' => ['nullable', 'numeric'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.description' => ['required', 'string', 'max:500'],
            'items.*.long_description' => ['nullable', 'string', 'max:5000'],
            'items.*.hsn_code' => ['nullable', 'string', 'max:50'],
            'items.*.qty' => ['required', 'numeric', 'min:0'],
            'items.*.rate' => ['required', 'numeric'],
            'items.*.unit' => ['nullable', 'string', 'max:40'],
            'items.*.taxes' => ['nullable', 'array'],
            'items.*.taxes.*.tax_name' => ['required', 'string', 'max:100'],
            'items.*.taxes.*.tax_rate' => ['required', 'numeric', 'min:0', 'max:100'],
        ];
    }
}
