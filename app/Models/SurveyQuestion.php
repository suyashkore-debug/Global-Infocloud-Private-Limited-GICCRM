<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SurveyQuestion extends Model
{
    public const TYPES = ['checkbox', 'radio', 'input', 'textarea'];

    protected $fillable = ['survey_id', 'type', 'question', 'required', 'question_order'];

    protected function casts(): array
    {
        return ['required' => 'boolean'];
    }

    /**
     * @return HasMany<SurveyQuestionOption, $this>
     */
    public function options(): HasMany
    {
        return $this->hasMany(SurveyQuestionOption::class)->orderBy('option_order')->orderBy('id');
    }

    public function isChoice(): bool
    {
        return in_array($this->type, ['checkbox', 'radio'], true);
    }
}
