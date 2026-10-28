<?php

namespace App\Http\Controllers\Api;

use App\Enums\InvoiceStatus;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Models\CalendarEvent;
use App\Models\Contract;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\Reminder;
use App\Models\Task;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Utilities → Calendar: own and public events, plus (like Perfex) due tasks, invoices, estimates,
 * project deadlines, contract ends and the user's reminders, each limited to what the user may see.
 */
class CalendarController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['start' => ['required', 'date'], 'end' => ['required', 'date', 'after_or_equal:start']]);
        $user = $request->user();
        [$from, $to] = [$data['start'], $data['end']];
        $items = collect();

        CalendarEvent::where(fn ($q) => $q->where('user_id', $user->id)->orWhere('public', true))
            ->where('start', '<=', $to.' 23:59:59')->where(fn ($q) => $q->whereNull('end')->where('start', '>=', $from)->orWhere('end', '>=', $from))
            ->with('user')->get()
            ->each(fn ($e) => $items->push([
                'id' => 'event-'.$e->id, 'event_id' => $e->id, 'type' => 'event', 'title' => $e->title, 'description' => $e->description,
                'start' => $e->start->toDateTimeString(), 'end' => $e->end?->toDateTimeString(), 'color' => $e->color, 'public' => $e->public,
                'reminder_before' => $e->reminder_before, 'reminder_before_type' => $e->reminder_before_type,
                'editable' => (int) $e->user_id === (int) $user->id, 'author' => $e->user?->full_name,
            ]));

        // Settings → Calendar decides which kinds of items appear.
        $show = fn (string $option) => Options::get($option) === '1';

        if ($show('show_tasks_on_calendar')) {
            Task::visibleTo($user)->where('status', '!=', TaskStatus::Complete)->whereBetween('due_date', [$from, $to])
                ->when($show('calendar_only_assigned_tasks'), fn ($q) => $q->whereHas('assignees', fn ($a) => $a->where('user_id', $user->id)))
                ->get(['id', 'name', 'due_date', 'project_id'])
                ->each(fn ($t) => $items->push(['id' => 'task-'.$t->id, 'type' => 'task', 'title' => 'Task: '.$t->name, 'start' => $t->due_date->toDateString(), 'color' => '#3b82f6', 'link' => "?task={$t->id}"]));
        }

        if ($show('show_invoices_on_calendar') && ($user->hasPermission('invoices', 'view') || $user->hasPermission('invoices', 'view_own'))) {
            Invoice::visibleTo($user)->whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid, InvoiceStatus::Overdue])->whereBetween('due_date', [$from, $to])->get()
                ->each(fn ($i) => $items->push(['id' => 'invoice-'.$i->id, 'type' => 'invoice', 'title' => 'Invoice due: '.$i->formattedNumber(), 'start' => $i->due_date->toDateString(), 'color' => '#ef4444', 'link' => "/invoices/{$i->id}"]));
        }
        if ($show('show_estimates_on_calendar') && ($user->hasPermission('estimates', 'view') || $user->hasPermission('estimates', 'view_own'))) {
            Estimate::visibleTo($user)->whereNull('invoice_id')->whereBetween('expiry_date', [$from, $to])->get()
                ->each(fn ($e) => $items->push(['id' => 'estimate-'.$e->id, 'type' => 'estimate', 'title' => 'Estimate expires: '.$e->formattedNumber(), 'start' => $e->expiry_date->toDateString(), 'color' => '#f59e0b', 'link' => "/estimates/{$e->id}"]));
        }
        if ($show('show_projects_on_calendar')) {
            Project::visibleTo($user)->whereBetween('deadline', [$from, $to])->get(['id', 'name', 'deadline'])
                ->each(fn ($p) => $items->push(['id' => 'project-'.$p->id, 'type' => 'project', 'title' => 'Project deadline: '.$p->name, 'start' => $p->deadline->toDateString(), 'color' => '#8b5cf6', 'link' => "/projects/{$p->id}"]));
        }
        if ($show('show_contracts_on_calendar') && ($user->hasPermission('contracts', 'view') || $user->hasPermission('contracts', 'view_own'))) {
            Contract::visibleTo($user)->where('trash', false)->whereBetween('end_date', [$from, $to])->get(['id', 'subject', 'end_date'])
                ->each(fn ($c) => $items->push(['id' => 'contract-'.$c->id, 'type' => 'contract', 'title' => 'Contract ends: '.$c->subject, 'start' => $c->end_date->toDateString(), 'color' => '#14b8a6', 'link' => "/contracts/{$c->id}"]));
        }
        if ($show('show_reminders_on_calendar')) {
            Reminder::where('user_id', $user->id)->whereBetween('remind_at', [$from, $to.' 23:59:59'])->get()
                ->each(fn ($r) => $items->push(['id' => 'reminder-'.$r->id, 'type' => 'reminder', 'title' => 'Reminder: '.($r->description ?: class_basename($r->remindable_type)), 'start' => $r->remind_at->toDateTimeString(), 'color' => '#64748b']));
        }

        return response()->json(['data' => $items->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => CalendarEvent::create([...$this->validated($request), 'user_id' => $request->user()->id])], 201);
    }

    public function update(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless((int) $event->user_id === (int) $request->user()->id, 403);
        $event->update([...$this->validated($request), 'start_notified' => false]);

        return response()->json(['data' => $event]);
    }

    public function destroy(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless((int) $event->user_id === (int) $request->user()->id || $request->user()->isAdmin(), 403);
        $event->delete();

        return response()->json(['message' => 'Event deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:300'],
            'description' => ['nullable', 'string', 'max:5000'],
            'start' => ['required', 'date'],
            'end' => ['nullable', 'date', 'after_or_equal:start'],
            'public' => ['boolean'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'reminder_before' => ['nullable', 'integer', 'min:0'],
            'reminder_before_type' => ['nullable', 'in:minutes,hours,days,weeks'],
        ]);
    }
}
