<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class PurchaseApproval extends Model
{
    protected $fillable = ['approvable_type', 'approvable_id', 'staff_id', 'decision', 'note', 'decided_at', 'sender_id'];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime', 'decision' => 'integer'];
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function approvable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function staff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'staff_id');
    }
}
