<?php

namespace App\Http\Requests;

use App\Enums\BillingType;
use App\Enums\ProjectStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProjectRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:191'],
            'customer_id' => ['required', 'integer', $this->existsInCompany('customers')],
            'description' => ['nullable', 'string', 'max:65000'],
            'workspace_link' => ['nullable', 'url:http,https', 'max:500'],
            'status' => ['required', Rule::enum(ProjectStatus::class)],
            'billing_type' => ['required', Rule::enum(BillingType::class)],
            'project_cost' => ['nullable', 'numeric', 'min:0', Rule::requiredIf(fn () => (int) $this->input('billing_type') === BillingType::FixedRate->value)],
            'project_rate_per_hour' => ['nullable', 'numeric', 'min:0', Rule::requiredIf(fn () => (int) $this->input('billing_type') === BillingType::ProjectHours->value)],
            'estimated_hours' => ['nullable', 'numeric', 'min:0'],
            'customer_settings' => ['nullable', 'array'],
            'customer_settings.*' => ['boolean'],
            'start_date' => ['required', 'date'],
            'deadline' => ['nullable', 'date', 'after_or_equal:start_date'],
            'progress_from_tasks' => ['boolean'],
            'progress' => ['nullable', 'integer', 'between:0,100'],
            'members' => ['array'],
            'members.*' => ['integer', $this->staffMember()],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
            'mark_all_tasks_complete' => ['boolean'],
        ];
    }
}
