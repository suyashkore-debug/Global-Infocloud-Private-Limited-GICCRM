<?php

namespace App\Support;

use Illuminate\Validation\Rule;

/**
 * Validation for the fields of a public web form (estimate request forms, web to lead forms):
 * each field's rules from its type, required flag and options.
 */
class PublicFormFields
{
    /**
     * @param  array<int, array{type: string, name: string, required?: bool, options?: array<int, string>}>  $fields
     * @return array<string, array<int, mixed>>
     */
    public static function rules(array $fields): array
    {
        $rules = [];
        foreach ($fields as $field) {
            $name = $field['name'];
            $base = [($field['required'] ?? false) ? 'required' : 'nullable'];
            $options = $field['options'] ?? [];
            $rules = match ($field['type']) {
                'email' => [...$rules, $name => [...$base, 'email', 'max:191']],
                'number' => [...$rules, $name => [...$base, 'numeric']],
                'date' => [...$rules, $name => [...$base, 'date']],
                'textarea' => [...$rules, $name => [...$base, 'string', 'max:10000']],
                'select', 'radio' => [...$rules, $name => [...$base, 'string', Rule::in($options)]],
                'checkbox' => [...$rules, $name => [...$base, 'array'], "{$name}.*" => ['string', Rule::in($options)]],
                'file' => [...$rules, $name => [...$base, 'array', 'max:5'], "{$name}.*" => ['file', 'max:10240']],
                default => [...$rules, $name => [...$base, 'string', 'max:1000']],
            };
        }

        return $rules;
    }
}
