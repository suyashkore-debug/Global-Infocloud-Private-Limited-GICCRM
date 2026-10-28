<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class Announcement extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'message', 'show_to_staff', 'show_to_customers', 'show_name', 'created_by'];

    protected function casts(): array
    {
        return ['show_to_staff' => 'boolean', 'show_to_customers' => 'boolean', 'show_name' => 'boolean'];
    }

    public function isDismissedBy(User $user): bool
    {
        return DB::table('announcement_dismissals')->where('announcement_id', $this->id)->where('user_id', $user->id)->exists();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
