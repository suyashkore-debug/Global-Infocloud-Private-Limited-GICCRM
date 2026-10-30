<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

/**
 * An invoice or estimate e-mail waiting to be sent at scheduled_at (Perfex scheduled_emails).
 */
class ScheduledEmail extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'rel_type', 'rel_id', 'scheduled_at', 'recipients', 'cc', 'attach_pdf', 'subject', 'message', 'created_by'];

    protected function casts(): array
    {
        return ['scheduled_at' => 'datetime', 'recipients' => 'array', 'attach_pdf' => 'boolean'];
    }
}
