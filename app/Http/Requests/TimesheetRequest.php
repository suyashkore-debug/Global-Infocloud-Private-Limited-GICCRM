<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A manual time entry: a start/end pair, or a h:mm duration that ends now.
 */
class TimesheetRequest extends FormRequest
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
            'duration' => ['nullable', 'regex:/^\d{1,3}:[0-5]\d$/', 'required_without:start_time'],
            'start_time' => ['nullable', 'date', 'required_without:duration'],
            'end_time' => ['nullable', 'date', 'required_with:start_time', 'after_or_equal:start_time'],
            'user_id' => ['nullable', 'integer', $this->staffMember()],
            'note' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
