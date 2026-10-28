<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class Currency extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'symbol', 'decimal_separator', 'thousand_separator', 'placement', 'is_default'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean'];
    }

    /**
     * The company's base currency; created (INR) the first time it is needed.
     */
    public static function default(): self
    {
        return static::where('is_default', true)->first()
            ?? static::first()
            ?? static::create(['name' => 'INR', 'symbol' => '₹', 'is_default' => true]);
    }
}
