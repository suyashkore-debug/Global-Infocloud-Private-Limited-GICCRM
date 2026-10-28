<?php

namespace App\Models;

use App\Enums\BillingType;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Concerns\HasTags;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use BelongsToCompany, HasFactory, HasTags;

    protected $fillable = [
        'company_id', 'customer_id', 'name', 'description', 'workspace_link', 'status', 'customer_settings', 'billing_type', 'project_cost',
        'project_rate_per_hour', 'estimated_hours', 'start_date', 'deadline', 'date_finished',
        'progress', 'progress_from_tasks', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => ProjectStatus::class,
            'customer_settings' => 'array',
            'billing_type' => BillingType::class,
            'project_cost' => 'decimal:2',
            'project_rate_per_hour' => 'decimal:2',
            'estimated_hours' => 'decimal:2',
            'start_date' => 'date',
            'deadline' => 'date',
            'date_finished' => 'datetime',
            'progress' => 'integer',
            'progress_from_tasks' => 'boolean',
        ];
    }

    /**
     * Projects a user may see without the "view all projects" permission: the ones they are a member of.
     *
     * @param  Builder<Project>  $query
     */
    /** Perfex project "Settings": what the customer sees in the customers area (defaults). */
    public const CUSTOMER_SETTINGS = [
        'view_tasks' => true,
        'comment_on_tasks' => true,
        'view_task_comments' => true,
        'view_task_checklist_items' => true,
        'view_task_total_logged_time' => true,
        'view_milestones' => true,
        'view_timesheets' => true,
        'view_team_members' => true,
        'view_finance_overview' => true,
        'view_activity_log' => false,
    ];

    /**
     * @return array<string, bool>
     */
    public function customerSettings(): array
    {
        return [...self::CUSTOMER_SETTINGS, ...array_intersect_key((array) ($this->customer_settings ?? []), self::CUSTOMER_SETTINGS)];
    }

    public function customerCan(string $setting): bool
    {
        return (bool) ($this->customerSettings()[$setting] ?? false);
    }

    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if (! $user->hasPermission('projects', 'view')) {
            $query->whereHas('members', fn (Builder $members) => $members->where('user_id', $user->id));
        }
    }

    public function hasMember(User $user): bool
    {
        return $this->members()->where('user_id', $user->id)->exists();
    }

    /**
     * Progress in percent: 100 when finished, from tasks when set so, otherwise the manual value.
     */
    public function calculatedProgress(): int
    {
        if ($this->status === ProjectStatus::Finished) {
            return 100;
        }

        if (! $this->progress_from_tasks) {
            return (int) $this->progress;
        }

        $total = $this->tasks()->count();
        if ($total === 0) {
            return 0;
        }

        $finished = $this->tasks()->where('status', TaskStatus::Complete)->count();

        return (int) floor($finished * 100 / $total);
    }

    /**
     * Seconds logged on this project's tasks; a running timer counts up to now.
     */
    public function totalLoggedSeconds(): int
    {
        return TaskTimer::whereIn('task_id', $this->tasks()->select('id'))->get()->sum(fn (TaskTimer $timer) => $timer->durationSeconds());
    }

    public function logActivity(string $descriptionKey, ?string $additionalData = null, ?int $userId = null): void
    {
        $this->activities()->create([
            'user_id' => $userId ?? auth()->id(),
            'description_key' => $descriptionKey,
            'additional_data' => $additionalData,
        ]);
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @return HasMany<ProjectMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    /**
     * @return HasMany<ProjectPin, $this>
     */
    public function pins(): HasMany
    {
        return $this->hasMany(ProjectPin::class);
    }

    /**
     * @return HasMany<ProjectNote, $this>
     */
    public function notes(): HasMany
    {
        return $this->hasMany(ProjectNote::class);
    }

    /**
     * @return HasMany<ProjectActivity, $this>
     */
    public function activities(): HasMany
    {
        return $this->hasMany(ProjectActivity::class);
    }

    /**
     * @return HasMany<Milestone, $this>
     */
    public function milestones(): HasMany
    {
        return $this->hasMany(Milestone::class)->orderBy('milestone_order')->orderBy('due_date');
    }

    /**
     * @return HasMany<Task, $this>
     */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    /**
     * @return HasManyThrough<TaskTimer, Task, $this>
     */
    public function timers(): HasManyThrough
    {
        return $this->hasManyThrough(TaskTimer::class, Task::class);
    }

    /**
     * @return HasMany<Discussion, $this>
     */
    public function discussions(): HasMany
    {
        return $this->hasMany(Discussion::class);
    }

    /**
     * Files uploaded to the project itself (not task attachments).
     *
     * @return HasMany<Attachment, $this>
     */
    public function files(): HasMany
    {
        return $this->hasMany(Attachment::class)->where('attachable_type', self::class);
    }
}
