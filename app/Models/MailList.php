<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MailList extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'created_by'];

    /**
     * @return HasMany<MailListEmail, $this>
     */
    public function emails(): HasMany
    {
        return $this->hasMany(MailListEmail::class);
    }
}
