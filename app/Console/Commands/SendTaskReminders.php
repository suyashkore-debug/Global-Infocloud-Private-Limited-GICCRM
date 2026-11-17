<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use App\Models\CalendarEvent;
use App\Models\Lead;
use App\Models\Reminder;
use App\Models\TaskReminder;
use App\Models\User;
use App\Services\Emails;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Turns due task reminders, record reminders and lead follow-ups into notifications (runs every minute).
 */
class SendTaskReminders extends Command
{
    protected $signature = 'tasks:send-reminders';

    protected $description = 'Send task reminders that are due';

    public function handle(): int
    {
        TaskReminder::query()
            ->where('is_notified', false)
            ->where('remind_at', '<=', now())
            ->with('task')
            ->each(function (TaskReminder $reminder) {
                $task = $reminder->task;
                if ($task) {
                    if ($reminder->notify_by_email) {
                        self::email((int) $task->company_id, (int) $reminder->user_id, $reminder->description, $reminder->remind_at, 'Task: '.$task->name, Emails::url("/tasks?task={$task->id}"));
                    }
                    AppNotification::create([
                        'company_id' => $task->company_id,
                        'user_id' => $reminder->user_id,
                        'from_user_id' => $reminder->created_by,
                        'description' => 'reminder for task '.$task->name.($reminder->description ? ': '.$reminder->description : ''),
                        'link' => $task->project_id ? "/projects/{$task->project_id}?tab=tasks&task={$task->id}" : "/tasks?task={$task->id}",
                    ]);
                }
                $reminder->update(['is_notified' => true]);
            });

        // Reminders on leads, customers, contracts, tickets, expenses.
        Reminder::withoutGlobalScopes()
            ->where('is_notified', false)
            ->where('remind_at', '<=', now())
            ->each(function (Reminder $reminder) {
                $type = strtolower(class_basename($reminder->remindable_type));
                $link = match ($type) {
                    'lead' => "/leads?lead={$reminder->remindable_id}",
                    'customer' => "/customers/{$reminder->remindable_id}",
                    default => "/{$type}s/{$reminder->remindable_id}",
                };
                if ($reminder->notify_by_email) {
                    self::email((int) $reminder->company_id, (int) $reminder->user_id, $reminder->description, $reminder->remind_at, ucfirst($type).' #'.$reminder->remindable_id, Emails::url($link));
                }
                AppNotification::create([
                    'company_id' => $reminder->company_id,
                    'user_id' => $reminder->user_id,
                    'from_user_id' => $reminder->created_by,
                    'description' => "reminder for {$type} #{$reminder->remindable_id}".($reminder->description ? ': '.$reminder->description : ''),
                    'link' => match ($type) {
                        'lead' => "/leads?lead={$reminder->remindable_id}",
                        'customer' => "/customers/{$reminder->remindable_id}",
                        default => "/{$type}s/{$reminder->remindable_id}",
                    },
                ]);
                $reminder->update(['is_notified' => true]);
            });

        // Lead follow-ups that are due: the assignee and whoever set it are told (in the app and by e-mail).
        Lead::withoutGlobalScopes()
            ->whereNotNull('next_follow_up_at')
            ->whereNull('follow_up_notified_at')
            ->where('next_follow_up_at', '<=', now())
            ->where('lost', false)->where('junk', false)
            ->each(function (Lead $lead) {
                $link = "/leads?lead={$lead->id}";
                $text = "Follow-up due: {$lead->name}".($lead->follow_up_note ? " ({$lead->follow_up_note})" : '');
                foreach (collect([$lead->assigned_id, $lead->follow_up_by ?: $lead->created_by])->filter()->unique() as $userId) {
                    AppNotification::create([
                        'company_id' => $lead->company_id,
                        'user_id' => $userId,
                        'from_user_id' => $lead->follow_up_by,
                        'description' => $text,
                        'link' => $link,
                    ]);
                    self::email((int) $lead->company_id, (int) $userId, $text, $lead->next_follow_up_at, "Lead #{$lead->id} {$lead->name}", Emails::url($link));
                }
                // Saved quietly: not a change of the lead for its Activity Log.
                $lead->forceFill(['follow_up_notified_at' => now()])->saveQuietly();
            });

        // Calendar events with "notify before" (Perfex event reminders).
        CalendarEvent::withoutGlobalScopes()
            ->where('start_notified', false)
            ->where('reminder_before', '>', 0)
            ->where('start', '>', now())
            ->each(function (CalendarEvent $event) {
                $notifyAt = match ($event->reminder_before_type) {
                    'hours' => $event->start->copy()->subHours($event->reminder_before),
                    'days' => $event->start->copy()->subDays($event->reminder_before),
                    'weeks' => $event->start->copy()->subWeeks($event->reminder_before),
                    default => $event->start->copy()->subMinutes($event->reminder_before),
                };
                if ($notifyAt->isFuture()) {
                    return;
                }
                AppNotification::create([
                    'company_id' => $event->company_id,
                    'user_id' => $event->user_id,
                    'description' => "event {$event->title} starts {$event->start->format('d-m-Y H:i')}",
                    'link' => '/utilities/calendar',
                ]);
                $event->update(['start_notified' => true]);
            });

        return self::SUCCESS;
    }

    /**
     * Perfex "You Have a New Reminder!" e-mail, when the reminder was set with "Send also an e-mail".
     */
    private static function email(int $companyId, int $userId, ?string $description, mixed $date, string $relation, string $link): void
    {
        if ($user = User::find($userId)) {
            Emails::send('reminder-email-staff', $companyId, (string) $user->email, [
                ...Emails::staff($user),
                'staff_reminder_description' => $description,
                'staff_reminder_date' => $date ? Carbon::parse($date)->format('d-m-Y H:i') : null,
                'staff_reminder_relation_name' => $relation,
                'staff_reminder_relation_link' => $link,
            ]);
        }
    }
}
