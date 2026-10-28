<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskReminder extends Model
{
    protected $fillable = ['task_id', 'user_id', 'created_by', 'remind_at', 'description', 'notify_by_email', 'is_notified'];

    protected function casts(): array
    {
        return ['remind_at' => 'datetime', 'notify_by_email' => 'boolean', 'is_notified' => 'boolean'];
    }

    /**
     * @return BelongsTo<Task, $this>
     */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
