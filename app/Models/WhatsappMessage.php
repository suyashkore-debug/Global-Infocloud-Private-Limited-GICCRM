<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One WhatsApp message to or from a lead. Written through App\Services\WhatsApp.
 */
class WhatsappMessage extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'lead_id', 'user_id', 'direction', 'wa_id', 'wamid', 'type', 'body', 'template', 'status', 'error', 'read_at', 'created_at'];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Lead, $this>
     */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
