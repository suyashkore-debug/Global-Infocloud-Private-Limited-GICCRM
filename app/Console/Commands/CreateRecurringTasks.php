<?php

namespace App\Console\Commands;

use App\Enums\TaskStatus;
use App\Models\Task;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Perfex recurring tasks: when a recurring task's next date arrives, a copy is created for that
 * date (with its assignees, followers and checklist) until the cycles run out. Runs daily.
 */
class CreateRecurringTasks extends Command
{
    protected $signature = 'tasks:create-recurring';

    protected $description = 'Create the next copy of every recurring task that is due';

    public function handle(): int
    {
        $created = 0;

        Task::query()
            ->whereNotNull('repeat_every')
            ->whereNotNull('recurring_type')
            ->where(fn ($q) => $q->where('cycles', 0)->orWhereColumn('total_cycles', '<', 'cycles'))
            ->with(['assignees', 'followers', 'checklistItems', 'tags'])
            ->each(function (Task $task) use (&$created) {
                while (($next = $this->nextDate($task)) && $next->lessThanOrEqualTo(today())) {
                    $this->createOccurrence($task, $next);
                    $created++;

                    if ($task->cycles > 0 && $task->total_cycles >= $task->cycles) {
                        break;
                    }
                }
            });

        $this->info("Created {$created} recurring task(s).");

        return self::SUCCESS;
    }

    private function nextDate(Task $task): ?CarbonImmutable
    {
        $from = CarbonImmutable::parse($task->last_recurring_date ?? $task->start_date);

        return match ($task->recurring_type) {
            'day' => $from->addDays($task->repeat_every),
            'week' => $from->addWeeks($task->repeat_every),
            'month' => $from->addMonthsNoOverflow($task->repeat_every),
            'year' => $from->addYearsNoOverflow($task->repeat_every),
            default => null,
        };
    }

    private function createOccurrence(Task $task, CarbonImmutable $date): void
    {
        DB::transaction(function () use ($task, $date) {
            $copy = $task->replicate([
                'repeat_every', 'recurring_type', 'cycles', 'total_cycles', 'last_recurring_date', 'date_finished',
            ]);
            $copy->fill([
                'status' => TaskStatus::NotStarted,
                'start_date' => $date,
                'due_date' => $task->due_date ? $date->addDays((int) $task->start_date->diffInDays($task->due_date, true)) : null,
                'recurring_from_id' => $task->id,
            ]);
            $copy->save();

            $copy->tags()->sync($task->tags->mapWithKeys(fn ($tag) => [$tag->id => ['tag_order' => $tag->pivot->tag_order]])->all());
            foreach ($task->assignees as $assignee) {
                $copy->assignees()->create(['user_id' => $assignee->user_id, 'assigned_by' => $assignee->assigned_by]);
            }
            foreach ($task->followers as $follower) {
                $copy->followers()->create(['user_id' => $follower->user_id]);
            }
            foreach ($task->checklistItems as $item) {
                $copy->checklistItems()->create([
                    'description' => $item->description,
                    'list_order' => $item->list_order,
                    'assigned_to' => $item->assigned_to,
                    'created_by' => $item->created_by,
                ]);
            }

            $task->update(['last_recurring_date' => $date, 'total_cycles' => $task->total_cycles + 1]);
        });
    }
}
