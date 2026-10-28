<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VendorContact extends Model
{
    protected $fillable = ['vendor_id', 'is_primary', 'first_name', 'last_name', 'email', 'phone', 'title', 'active'];

    protected function casts(): array
    {
        return ['is_primary' => 'boolean', 'active' => 'boolean'];
    }

    /**
     * @return BelongsTo<Vendor, $this>
     */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }
}
