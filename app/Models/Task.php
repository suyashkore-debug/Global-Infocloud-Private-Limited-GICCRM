<?php

namespace App\Models;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasTags;
use App\Support\TimerRounding;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use BelongsToCompany, HasFactory, HasTags;

    protected $fillable = [
        'company_id', 'project_id', 'lead_id', 'milestone_id', 'name', 'description', 'priority', 'status',
        'start_date', 'due_date', 'date_finished', 'is_public', 'visible_to_client', 'billable', 'invoice_id', 'hourly_rate',
        'kanban_order', 'milestone_order', 'repeat_every', 'recurring_type', 'cycles',
        'total_cycles', 'last_recurring_date', 'recurring_from_id', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => TaskStatus::class,
            'priority' => TaskPriority::class,
            'start_date' => 'date',
            'due_date' => 'date',
            'date_finished' => 'datetime',
            'last_recurring_date' => 'date',
            'is_public' => 'boolean',
            'billable' => 'boolean',
            'visible_to_client' => 'boolean',
            'hourly_rate' => 'decimal:2',
        ];
    }

    /**
     * Tasks a user may see without the "view all tasks" permission, as in Perfex: assigned to them,
     * followed by them, created by them, in a project they are a member of, or public.
     *
     * @param  Builder<Task>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->hasPermission('tasks', 'view')) {
            return;
        }

        $query->where(function (Builder $visible) use ($user) {
            $visible->whereHas('assignees', fn (Builder $q) => $q->where('user_id', $user->id))
                ->orWhereHas('followers', fn (Builder $q) => $q->where('user_id', $user->id))
                ->orWhere('created_by', $user->id)
                ->orWhereHas('project.members', fn (Builder $q) => $q->where('user_id', $user->id))
                ->orWhere('is_public', true);
        });
    }

    public function isAssignee(User $user): bool
    {
        return $this->assignees->contains('user_id', $user->id);
    }

    public function isFollower(User $user): bool
    {
        return $this->followers->contains('user_id', $user->id);
    }

    public function isCreator(User $user): bool
    {
        return (int) $this->created_by === (int) $user->id;
    }

    public function totalLoggedSeconds(): int
    {
        // Perfex rounds the task's total, not each timer (Settings → Tasks "Round off task timer").
        return TimerRounding::round((int) $this->timers->sum(fn (TaskTimer $timer) => $timer->durationSeconds()), $this->company_id ? (int) $this->company_id : null);
    }

    /**
     * @return BelongsTo<Lead, $this>
     */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<Milestone, $this>
     */
    public function milestone(): BelongsTo
    {
        return $this->belongsTo(Milestone::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @return HasMany<TaskAssignee, $this>
     */
    public function assignees(): HasMany
    {
        return $this->hasMany(TaskAssignee::class);
    }

    /**
     * @return HasMany<TaskFollower, $this>
     */
    public function followers(): HasMany
    {
        return $this->hasMany(TaskFollower::class);
    }

    /**
     * @return HasMany<TaskChecklistItem, $this>
     */
    public function checklistItems(): HasMany
    {
        return $this->hasMany(TaskChecklistItem::class)->orderBy('list_order')->orderBy('id');
    }

    /**
     * @return HasMany<TaskChecklistItem, $this>
     */
    public function finishedChecklistItems(): HasMany
    {
        return $this->hasMany(TaskChecklistItem::class)->where('finished', true);
    }

    /**
     * @return HasMany<TaskComment, $this>
     */
    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class)->orderBy('created_at');
    }

    /**
     * @return HasMany<TaskTimer, $this>
     */
    public function timers(): HasMany
    {
        return $this->hasMany(TaskTimer::class);
    }

    /**
     * @return HasMany<TaskReminder, $this>
     */
    public function reminders(): HasMany
    {
        return $this->hasMany(TaskReminder::class);
    }

    /**
     * @return MorphMany<Attachment, $this>
     */
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }
}
