<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomField extends Model
{
    use BelongsToCompany;

    public const TYPES = ['input', 'number', 'textarea', 'select', 'multiselect', 'checkbox', 'date_picker', 'date_picker_time', 'colorpicker', 'link'];

    protected $fillable = [
        'company_id', 'field_to', 'name', 'slug', 'type', 'options', 'default_value', 'required', 'active', 'only_admin',
        'show_on_table', 'show_on_pdf', 'field_order', 'bs_column',
    ];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'required' => 'boolean',
            'active' => 'boolean',
            'only_admin' => 'boolean',
            'show_on_table' => 'boolean',
            'show_on_pdf' => 'boolean',
        ];
    }

    /**
     * @return HasMany<CustomFieldValue, $this>
     */
    public function values(): HasMany
    {
        return $this->hasMany(CustomFieldValue::class);
    }

    /**
     * Multiple choices (multiselect, checkbox) are stored comma separated, as in Perfex.
     */
    public function isMultiple(): bool
    {
        return in_array($this->type, ['multiselect', 'checkbox'], true);
    }
}
