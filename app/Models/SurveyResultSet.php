<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SurveyResultSet extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['survey_id', 'ip', 'user_agent', 'user_id'];

    /**
     * @return HasMany<SurveyAnswer, $this>
     */
    public function answers(): HasMany
    {
        return $this->hasMany(SurveyAnswer::class);
    }
}
