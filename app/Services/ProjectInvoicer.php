<?php

namespace App\Services;

use App\Enums\BillingType;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\PaymentMode;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Perfex "Invoice project": the billable tasks not yet invoiced and the project's billable
 * expenses become a draft invoice, as one line, one line per task or one line per timesheet.
 * The tasks and expenses then point at the invoice (deleting it frees them).
 */
class ProjectInvoicer
{
    public const TYPES = ['single_line', 'task_per_item', 'timesheets_individually'];

    public function __construct(private InvoiceService $invoices) {}

    /**
     * What can be invoiced: the billing details, unbilled billable tasks with their hours and
     * the project's billable expenses not invoiced yet.
     *
     * @return array<string, mixed>
     */
    public function preview(Project $project): array
    {
        $tasks = $this->tasks($project);
        $names = User::whereIn('id', $tasks->flatMap(fn (Task $t) => $t->timers->pluck('user_id'))->unique())->pluck('full_name', 'id');

        return [
            'billing_type' => $project->billing_type->value,
            'project_cost' => (float) $project->project_cost,
            'rate_per_hour' => (float) $project->project_rate_per_hour,
            'types' => $project->billing_type === BillingType::FixedRate ? ['single_line'] : self::TYPES,
            'tasks' => $tasks->map(fn (Task $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'status' => $t->status->value,
                'hours' => $this->hours($t->totalLoggedSeconds()),
                'rate' => $this->rate($project, $t),
                'amount' => round($this->hours($t->totalLoggedSeconds()) * $this->rate($project, $t), 2),
                'timesheets' => $t->timers->whereNotNull('end_time')->values()->map(fn (TaskTimer $timer) => [
                    'id' => $timer->id,
                    'user' => $names[$timer->user_id] ?? null,
                    'start' => $timer->start_time,
                    'end' => $timer->end_time,
                    'hours' => $this->hours($timer->roundedSeconds()),
                    'note' => $timer->note,
                ]),
            ])->values(),
            'expenses' => $this->expenses($project)->map(fn (Expense $e) => [
                'id' => $e->id,
                'name' => trim($e->category?->name.($e->name ? ' - '.$e->name : '')),
                'date' => $e->date?->toDateString(),
                'amount' => (float) $e->amount,
            ])->values(),
        ];
    }

    /**
     * @param  array{type: string, task_ids?: array<int, int>, expense_ids?: array<int, int>}  $data
     */
    public function invoice(Project $project, array $data): Invoice
    {
        $type = $project->billing_type === BillingType::FixedRate ? 'single_line' : $data['type'];
        $tasks = $this->tasks($project)->whereIn('id', $data['task_ids'] ?? [])->values();
        $expenses = $this->expenses($project)->whereIn('id', $data['expense_ids'] ?? [])->values();

        $lines = match ($type) {
            'task_per_item' => $tasks->map(fn (Task $t) => $this->line($t->name, null, $this->hours($t->totalLoggedSeconds()), $this->rate($project, $t)))->all(),
            'timesheets_individually' => $tasks->flatMap(fn (Task $t) => $t->timers->whereNotNull('end_time')->map(fn (TaskTimer $timer) => $this->line(
                $t->name,
                trim(($timer->user?->full_name ?? '').' · '.$timer->start_time->timezone('Asia/Kolkata')->format('d M Y H:i').' → '.$timer->end_time->timezone('Asia/Kolkata')->format('H:i').($timer->note ? "\n".$timer->note : '')),
                $this->hours($timer->roundedSeconds()),
                $this->rate($project, $t),
            )))->values()->all(),
            default => [$this->singleLine($project, $tasks)],
        };
        foreach ($expenses as $e) {
            $lines[] = [
                'description' => trim($e->category?->name.($e->name ? ' - '.$e->name : '')),
                'long_description' => $e->note,
                'qty' => 1,
                'rate' => $e->amount,
                'taxes' => collect([$e->tax, $e->tax2])->filter()->map(fn ($tax) => ['tax_name' => $tax->name, 'tax_rate' => $tax->rate])->values()->all(),
            ];
        }
        $lines = array_values(array_filter($lines, fn ($l) => (float) $l['qty'] > 0));
        if ($lines === []) {
            throw ValidationException::withMessages(['task_ids' => 'Choose tasks with logged time, or expenses, to invoice.']);
        }

        return DB::transaction(function () use ($project, $lines, $tasks, $expenses) {
            $today = today()->toDateString();
            $invoice = $this->invoices->create([
                'customer_id' => $project->customer_id,
                'project_id' => $project->id,
                'currency_id' => $project->customer?->default_currency_id,
                'date' => $today,
                'due_date' => $this->invoices->defaultDueDate($today),
                'terms' => Options::get('predefined_terms_invoice'),
                'client_note' => Options::get('predefined_clientnote_invoice'),
                'allowed_payment_modes' => PaymentMode::where('active', true)->where('expenses_only', false)->where('selected_by_default', true)->pluck('id')->all(),
                'items' => $lines,
                'save_as_draft' => true,
            ]);
            Task::whereIn('id', $tasks->pluck('id'))->update(['invoice_id' => $invoice->id]);
            Expense::whereIn('id', $expenses->pluck('id'))->update(['invoice_id' => $invoice->id]);
            $project->logActivity('project_activity_invoiced_project', $invoice->formattedNumber());

            return $invoice;
        });
    }

    /**
     * @param  Collection<int, Task>  $tasks
     * @return array<string, mixed>
     */
    private function singleLine(Project $project, Collection $tasks): array
    {
        $hours = $tasks->sum(fn (Task $t) => $this->hours($t->totalLoggedSeconds()));

        return match ($project->billing_type) {
            BillingType::FixedRate => $this->line($project->name, null, 1, (float) $project->project_cost),
            BillingType::ProjectHours => $this->line($project->name, null, $hours, (float) $project->project_rate_per_hour),
            BillingType::TaskHours => $this->line($project->name, $tasks->pluck('name')->implode(', '), 1, round($tasks->sum(fn (Task $t) => $this->hours($t->totalLoggedSeconds()) * $this->rate($project, $t)), 2)),
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function line(string $description, ?string $long, float $qty, float $rate): array
    {
        return ['description' => $description, 'long_description' => $long, 'qty' => round($qty, 2), 'rate' => $rate, 'unit' => 'hours', 'taxes' => []];
    }

    /** Project hours: the project's rate; task hours: each task's own rate. */
    private function rate(Project $project, Task $task): float
    {
        return (float) ($project->billing_type === BillingType::TaskHours ? $task->hourly_rate : $project->project_rate_per_hour);
    }

    private function hours(int $seconds): float
    {
        return round($seconds / 3600, 2);
    }

    /**
     * @return Collection<int, Task>
     */
    private function tasks(Project $project): Collection
    {
        return $project->tasks()->where('billable', true)->whereNull('invoice_id')->with('timers.user')->orderBy('id')->get();
    }

    /**
     * @return Collection<int, Expense>
     */
    private function expenses(Project $project): Collection
    {
        return Expense::where('project_id', $project->id)->where('billable', true)->whereNull('invoice_id')->with(['category', 'tax', 'tax2'])->orderBy('date')->get();
    }
}
