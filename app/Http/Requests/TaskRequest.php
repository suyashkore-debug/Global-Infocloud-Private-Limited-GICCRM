<?php

namespace App\Http\Requests;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TaskRequest extends FormRequest
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
        $creating = $this->isMethod('post');

        return [
            'name' => ['required', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:65000'],
            'project_id' => ['nullable', 'integer', $this->existsInCompany('projects')],
            'lead_id' => ['nullable', 'integer', $this->existsInCompany('leads')],
            'milestone_id' => ['nullable', 'integer', Rule::exists('milestones', 'id')->where('project_id', $this->input('project_id'))],
            'priority' => ['required', Rule::enum(TaskPriority::class)],
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
            'start_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_public' => ['boolean'],
            'visible_to_client' => ['boolean'],
            'billable' => ['boolean'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0'],
            'repeat_every' => ['nullable', 'integer', 'min:1', 'max:365'],
            'recurring_type' => ['nullable', 'required_with:repeat_every', Rule::in(['day', 'week', 'month', 'year'])],
            'cycles' => ['nullable', 'integer', 'min:0'],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
            'checklist_templates' => ['array'],
            'checklist_templates.*' => ['integer', $this->existsInCompany('checklist_templates')],
            'assignees' => [$creating ? 'array' : 'prohibited'],
            'assignees.*' => ['integer', $this->staffMember()],
            'followers' => [$creating ? 'array' : 'prohibited'],
            'followers.*' => ['integer', $this->staffMember()],
        ];
    }
}
