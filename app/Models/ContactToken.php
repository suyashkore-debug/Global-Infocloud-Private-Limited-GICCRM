<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ContactToken extends Model
{
    protected $fillable = ['contact_id', 'token', 'last_used_at', 'expires_at'];

    protected function casts(): array
    {
        return ['last_used_at' => 'datetime', 'expires_at' => 'datetime'];
    }

    /**
     * @return BelongsTo<Contact, $this>
     */
    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    /**
     * A new login token for the contact; only its hash is stored.
     */
    public static function issue(Contact $contact): string
    {
        $plain = Str::random(64);
        self::create(['contact_id' => $contact->id, 'token' => hash('sha256', $plain), 'expires_at' => now()->addDays(30)]);

        return $plain;
    }
}
