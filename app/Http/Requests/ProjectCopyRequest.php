<?php

namespace App\Http\Requests;

use App\Enums\TaskStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProjectCopyRequest extends FormRequest
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
            'name' => ['nullable', 'string', 'max:191'],
            'customer_id' => ['required', 'integer', $this->existsInCompany('customers')],
            'start_date' => ['required', 'date'],
            'deadline' => ['nullable', 'date', 'after_or_equal:start_date'],
            'copy_tasks' => ['boolean'],
            'copy_task_assignees' => ['boolean'],
            'copy_task_followers' => ['boolean'],
            'copy_task_checklist' => ['boolean'],
            'task_status' => ['nullable', Rule::enum(TaskStatus::class)],
            'copy_milestones' => ['boolean'],
            'copy_members' => ['boolean'],
        ];
    }
}
