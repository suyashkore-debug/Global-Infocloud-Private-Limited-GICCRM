<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\SharedAcrossWorkspaces;
use App\Services\Options;
use App\Support\CountryProfile;
use Illuminate\Database\Eloquent\Model;

class Currency extends Model
{
    use BelongsToCompany, SharedAcrossWorkspaces;

    protected $fillable = ['company_id', 'name', 'symbol', 'decimal_separator', 'thousand_separator', 'placement', 'is_default'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean'];
    }

    /**
     * The company's base currency; created (its country's, INR for India) the first time it is needed.
     */
    public static function default(): self
    {
        if ($currency = static::where('is_default', true)->first() ?? static::first()) {
            return $currency;
        }
        $profile = CountryProfile::for(Options::get('company_country') ?: 'India');

        return static::create(['name' => $profile['currency'], 'symbol' => $profile['symbol'], 'is_default' => true]);
    }
}
