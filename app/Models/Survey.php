<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Survey extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'subject', 'slug', 'description', 'view_description', 'from_name', 'redirect_url', 'ip_restrict',
        'only_for_logged_in', 'active', 'hash', 'created_by',
    ];

    protected function casts(): array
    {
        return ['ip_restrict' => 'boolean', 'only_for_logged_in' => 'boolean', 'active' => 'boolean'];
    }

    /**
     * @return HasMany<SurveyQuestion, $this>
     */
    public function questions(): HasMany
    {
        return $this->hasMany(SurveyQuestion::class)->orderBy('question_order')->orderBy('id');
    }

    /**
     * @return HasMany<SurveyResultSet, $this>
     */
    public function resultSets(): HasMany
    {
        return $this->hasMany(SurveyResultSet::class);
    }

    /**
     * @return HasMany<SurveySendLog, $this>
     */
    public function sendLogs(): HasMany
    {
        return $this->hasMany(SurveySendLog::class)->latest('id');
    }

    /**
     * The participant link (React page).
     */
    public function publicUrl(): string
    {
        return rtrim((string) config('app.url'), '/')."/survey/{$this->id}/{$this->hash}";
    }
}
