<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Payment;
use App\Models\PaymentMode;
use App\Models\Project;
use App\Models\PurchaseInvoice;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Models\Ticket;
use App\Models\User;
use App\Models\Vendor;
use App\Services\CustomFields;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Utilities → CSV Export (GICHRMS "CSV Export Manager"): a list as a CSV file for a period, with
 * its custom fields. Each type follows the same view rights as its list.
 */
class ExportController extends Controller
{
    private const PERIODS = ['all_time', 'this_month', 'last_month', 'this_year', 'last_year', 'last_3_months', 'last_6_months', 'last_12_months', 'custom'];

    /**
     * The types this user may export.
     */
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();

        return response()->json(['data' => collect($this->types())
            ->filter(fn ($t) => ($t['can'])($me))
            ->map(fn ($t, $key) => ['type' => $key, 'name' => $t['name'], 'date_label' => $t['date_label']])
            ->values()]);
    }

    public function export(Request $request, string $type): StreamedResponse
    {
        $me = $request->user();
        $types = $this->types();
        abort_unless(isset($types[$type]), 404);
        $def = $types[$type];
        abort_unless(($def['can'])($me), 403);

        $data = $request->validate([
            'period' => ['nullable', Rule::in(self::PERIODS)],
            'from' => ['required_if:period,custom', 'nullable', 'date'],
            'to' => ['required_if:period,custom', 'nullable', 'date', 'after_or_equal:from'],
        ]);
        [$from, $to] = $this->range($data['period'] ?? 'all_time', $data['from'] ?? null, $data['to'] ?? null);

        /** @var Builder<Model> $query */
        $query = ($def['query'])($me);
        if ($from) {
            $query->where($def['date'], '>=', $from->startOfDay())->where($def['date'], '<=', $to->endOfDay());
        }
        $columns = $def['columns'];
        $fields = isset($def['custom_fields']) ? CustomFields::definitions($def['custom_fields'], $me) : collect();
        $file = $type.'-'.now()->format('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($query, $columns, $fields, $def, $me) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 marker: Excel shows Marathi / Hindi correctly.
            fputcsv($out, [...array_keys($columns), ...$fields->pluck('name')->all()]);
            $query->chunkById(500, function (Collection $rows) use ($out, $columns, $fields, $def, $me) {
                $values = $fields->isNotEmpty() ? CustomFields::values($def['custom_fields'], $rows->pluck('id')->all(), $me) : [];
                foreach ($rows as $row) {
                    fputcsv($out, [
                        ...array_map(fn ($cell) => $this->cell($cell($row)), array_values($columns)),
                        ...$fields->map(fn ($f) => $this->cell($values[$row->id][$f->id] ?? null))->all(),
                    ]);
                }
            });
            fclose($out);
        }, $file, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function cell(mixed $value): string
    {
        if ($value instanceof \DateTimeInterface) {
            return CarbonImmutable::instance($value)->timezone('Asia/Kolkata')->format('Y-m-d H:i');
        }
        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }
        if ($value instanceof \BackedEnum) {
            return method_exists($value, 'label') ? $value->label() : (string) $value->value;
        }

        return trim(strip_tags(html_entity_decode((string) $value)));
    }

    /**
     * @return array{0: CarbonImmutable|null, 1: CarbonImmutable|null}
     */
    private function range(string $period, ?string $from, ?string $to): array
    {
        $now = CarbonImmutable::now('Asia/Kolkata');

        return match ($period) {
            'this_month' => [$now->startOfMonth(), $now->endOfMonth()],
            'last_month' => [$now->subMonthNoOverflow()->startOfMonth(), $now->subMonthNoOverflow()->endOfMonth()],
            'this_year' => [$now->startOfYear(), $now->endOfYear()],
            'last_year' => [$now->subYear()->startOfYear(), $now->subYear()->endOfYear()],
            'last_3_months' => [$now->subMonths(3)->startOfDay(), $now],
            'last_6_months' => [$now->subMonths(6)->startOfDay(), $now],
            'last_12_months' => [$now->subMonths(12)->startOfDay(), $now],
            'custom' => [CarbonImmutable::parse($from), CarbonImmutable::parse($to)],
            default => [null, null],
        };
    }

    /**
     * Every export: who may run it, its records, the date the period applies to and its columns.
     *
     * @return array<string, array<string, mixed>>
     */
    private function types(): array
    {
        $staff = fn (?int $id) => $id ? User::find($id)?->full_name : null;
        $mode = fn (?int $id) => $id ? PaymentMode::find($id)?->name : null;

        return [
            'customers' => [
                'name' => 'Customers', 'date' => 'created_at', 'date_label' => 'Date created', 'custom_fields' => 'customers',
                'can' => fn (User $u) => $u->can('viewAny', Customer::class),
                'query' => fn () => Customer::query()->with('groups'),
                'columns' => [
                    'ID' => fn ($c) => $c->id, 'Company' => fn ($c) => $c->name, 'GST / VAT' => fn ($c) => $c->vat, 'PAN' => fn ($c) => $c->company_pan,
                    'Phone' => fn ($c) => $c->phone, 'Website' => fn ($c) => $c->website, 'Address' => fn ($c) => $c->address, 'City' => fn ($c) => $c->city,
                    'State' => fn ($c) => $c->state, 'Zip' => fn ($c) => $c->zip, 'Country' => fn ($c) => $c->country,
                    'Groups' => fn ($c) => $c->groups->pluck('name')->implode(', '), 'Active' => fn ($c) => (bool) $c->is_active, 'Date created' => fn ($c) => $c->created_at,
                ],
            ],
            'contacts' => [
                'name' => 'Contacts', 'date' => 'created_at', 'date_label' => 'Date created', 'custom_fields' => 'contacts',
                'can' => fn (User $u) => $u->can('viewAny', Customer::class),
                'query' => fn () => Contact::query()->whereIn('customer_id', Customer::select('id'))->with('customer:id,name'),
                'columns' => [
                    'First name' => fn ($c) => $c->first_name, 'Last name' => fn ($c) => $c->last_name, 'Email' => fn ($c) => $c->email, 'Phone' => fn ($c) => $c->phone,
                    'Position' => fn ($c) => $c->title, 'Customer' => fn ($c) => $c->customer?->name, 'Primary' => fn ($c) => (bool) $c->is_primary,
                    'Active' => fn ($c) => (bool) $c->active, 'Last login' => fn ($c) => $c->last_login_at, 'Date created' => fn ($c) => $c->created_at,
                ],
            ],
            'leads' => [
                'name' => 'Leads', 'date' => 'created_at', 'date_label' => 'Date created', 'custom_fields' => 'leads',
                'can' => fn (User $u) => $u->can('viewAny', Lead::class),
                'query' => fn (User $u) => Lead::query()->visibleTo($u)->with(['status', 'source']),
                'columns' => [
                    'ID' => fn ($l) => $l->id, 'Name' => fn ($l) => $l->name, 'Position' => fn ($l) => $l->title, 'Company' => fn ($l) => $l->company, 'Email' => fn ($l) => $l->email,
                    'Phone' => fn ($l) => $l->phone, 'Website' => fn ($l) => $l->website, 'City' => fn ($l) => $l->city, 'State' => fn ($l) => $l->state, 'Country' => fn ($l) => $l->country,
                    'Status' => fn ($l) => $l->status?->name, 'Source' => fn ($l) => $l->source?->name, 'Assigned' => fn ($l) => $staff($l->assigned_id),
                    'Lead value' => fn ($l) => $l->lead_value, 'Lost' => fn ($l) => (bool) $l->lost, 'Junk' => fn ($l) => (bool) $l->junk,
                    'Last contact' => fn ($l) => $l->last_contact_at, 'Date created' => fn ($l) => $l->created_at,
                ],
            ],
            'expenses' => [
                'name' => 'Expenses', 'date' => 'date', 'date_label' => 'Expense date', 'custom_fields' => 'expenses',
                'can' => fn (User $u) => $u->can('viewAny', Expense::class),
                'query' => fn (User $u) => Expense::query()->visibleTo($u)->with(['category', 'customer:id,name', 'project:id,name', 'tax', 'tax2']),
                'columns' => [
                    'ID' => fn ($e) => $e->id, 'Category' => fn ($e) => $e->category?->name, 'Name' => fn ($e) => $e->name, 'Amount' => fn ($e) => $e->amount,
                    'Tax' => fn ($e) => collect([$e->tax, $e->tax2])->filter()->map(fn ($t) => "{$t->name} {$t->rate}%")->implode(', '),
                    'Date' => fn ($e) => $e->date?->toDateString(), 'Customer' => fn ($e) => $e->customer?->name, 'Project' => fn ($e) => $e->project?->name,
                    'Billable' => fn ($e) => (bool) $e->billable, 'Invoiced' => fn ($e) => $e->invoice_id !== null, 'Payment mode' => fn ($e) => $mode($e->payment_mode_id),
                    'Reference #' => fn ($e) => $e->reference_no, 'Note' => fn ($e) => $e->note,
                ],
            ],
            'invoices' => [
                'name' => 'Invoices', 'date' => 'date', 'date_label' => 'Invoice date', 'custom_fields' => 'invoice',
                'can' => fn (User $u) => $u->can('viewAny', Invoice::class),
                'query' => fn (User $u) => Invoice::query()->visibleTo($u)->with(['customer:id,name', 'project:id,name'])->withSum('payments', 'amount'),
                'columns' => [
                    'Invoice #' => fn ($i) => $i->formattedNumber(), 'Customer' => fn ($i) => $i->customer?->name, 'Project' => fn ($i) => $i->project?->name,
                    'Date' => fn ($i) => $i->date?->toDateString(), 'Due date' => fn ($i) => $i->due_date?->toDateString(), 'Subtotal' => fn ($i) => $i->subtotal,
                    'Tax' => fn ($i) => $i->total_tax, 'Total' => fn ($i) => $i->total, 'Paid' => fn ($i) => $i->payments_sum_amount ?? 0,
                    'Status' => fn ($i) => $i->status, 'Sale agent' => fn ($i) => $staff($i->sale_agent_id),
                ],
            ],
            'payments' => [
                'name' => 'Payments', 'date' => 'date', 'date_label' => 'Payment date',
                'can' => fn (User $u) => $u->can('viewAny', Invoice::class),
                'query' => fn (User $u) => Payment::query()->whereIn('invoice_id', Invoice::query()->visibleTo($u)->select('id'))->with(['invoice.customer:id,name', 'paymentMode']),
                'columns' => [
                    'Payment #' => fn ($p) => $p->id, 'Invoice #' => fn ($p) => $p->invoice?->formattedNumber(), 'Customer' => fn ($p) => $p->invoice?->customer?->name,
                    'Payment mode' => fn ($p) => $p->paymentMode?->name ?? $p->payment_method, 'Transaction ID' => fn ($p) => $p->transaction_id,
                    'Date' => fn ($p) => $p->date?->toDateString(), 'Amount' => fn ($p) => $p->amount, 'Note' => fn ($p) => $p->note,
                ],
            ],
            'projects' => [
                'name' => 'Projects', 'date' => 'start_date', 'date_label' => 'Start date', 'custom_fields' => 'projects',
                'can' => fn () => true,
                'query' => fn (User $u) => Project::query()->visibleTo($u)->with(['customer:id,name', 'members']),
                'columns' => [
                    'ID' => fn ($p) => $p->id, 'Project' => fn ($p) => $p->name, 'Customer' => fn ($p) => $p->customer?->name, 'Status' => fn ($p) => $p->status,
                    'Billing type' => fn ($p) => $p->billing_type, 'Project cost' => fn ($p) => $p->project_cost, 'Rate per hour' => fn ($p) => $p->project_rate_per_hour,
                    'Start date' => fn ($p) => $p->start_date?->toDateString(), 'Deadline' => fn ($p) => $p->deadline?->toDateString(),
                    'Finished' => fn ($p) => $p->date_finished, 'Members' => fn ($p) => $p->members->map(fn ($m) => $staff($m->user_id))->filter()->implode(', '),
                ],
            ],
            'tasks' => [
                'name' => 'Tasks', 'date' => 'start_date', 'date_label' => 'Start date', 'custom_fields' => 'tasks',
                'can' => fn () => true,
                'query' => fn (User $u) => Task::query()->visibleTo($u)->with(['project:id,name', 'assignees.user', 'timers', 'tags']),
                'columns' => [
                    '#' => fn ($t) => $t->id, 'Task' => fn ($t) => $t->name, 'Project' => fn ($t) => $t->project?->name, 'Status' => fn ($t) => $t->status,
                    'Priority' => fn ($t) => $t->priority, 'Start date' => fn ($t) => $t->start_date?->toDateString(), 'Due date' => fn ($t) => $t->due_date?->toDateString(),
                    'Finished' => fn ($t) => $t->date_finished, 'Assigned to' => fn ($t) => $t->assignees->map(fn ($a) => $a->user?->full_name)->filter()->implode(', '),
                    'Tags' => fn ($t) => $t->tags->pluck('name')->implode(', '), 'Billable' => fn ($t) => (bool) $t->billable, 'Billed' => fn ($t) => $t->invoice_id !== null,
                    'Logged hours' => fn ($t) => round($t->totalLoggedSeconds() / 3600, 2),
                ],
            ],
            'timesheets' => [
                'name' => 'Timesheets', 'date' => 'start_time', 'date_label' => 'Start time',
                'can' => fn () => true,
                // Everyone's with the Reports permission, otherwise only mine (as "My Timesheets").
                'query' => fn (User $u) => TaskTimer::query()->whereHas('task')->whereNotNull('end_time')
                    ->when(! ($u->isAdmin() || $u->hasPermission('reports', 'view')), fn ($q) => $q->where('user_id', $u->id))
                    ->with(['task:id,name,project_id', 'task.project:id,name', 'user']),
                'columns' => [
                    'Staff' => fn ($t) => $t->user?->full_name, 'Task' => fn ($t) => $t->task?->name, 'Project' => fn ($t) => $t->task?->project?->name,
                    'Start' => fn ($t) => $t->start_time, 'End' => fn ($t) => $t->end_time, 'Hours' => fn ($t) => round($t->durationSeconds() / 3600, 2), 'Note' => fn ($t) => $t->note,
                ],
            ],
            'tickets' => [
                'name' => 'Support tickets', 'date' => 'created_at', 'date_label' => 'Date opened', 'custom_fields' => 'tickets',
                'can' => fn () => true,
                'query' => fn (User $u) => Ticket::query()->visibleTo($u)->with(['customer:id,name', 'contact', 'department', 'priority', 'status', 'service']),
                'columns' => [
                    '#' => fn ($t) => $t->id, 'Subject' => fn ($t) => $t->subject, 'Customer' => fn ($t) => $t->customer?->name,
                    'Contact' => fn ($t) => $t->contact?->fullName() ?? $t->name, 'Department' => fn ($t) => $t->department?->name, 'Service' => fn ($t) => $t->service?->name,
                    'Priority' => fn ($t) => $t->priority?->name, 'Status' => fn ($t) => $t->status?->name, 'Assigned' => fn ($t) => $staff($t->assigned_id),
                    'Opened' => fn ($t) => $t->created_at, 'Last reply' => fn ($t) => $t->last_reply_at,
                ],
            ],
            'contracts' => [
                'name' => 'Contracts', 'date' => 'start_date', 'date_label' => 'Start date', 'custom_fields' => 'contracts',
                'can' => fn (User $u) => $u->can('viewAny', Contract::class),
                'query' => fn (User $u) => Contract::query()->visibleTo($u)->with(['customer:id,name', 'type', 'project:id,name']),
                'columns' => [
                    '#' => fn ($c) => $c->id, 'Subject' => fn ($c) => $c->subject, 'Customer' => fn ($c) => $c->customer?->name, 'Type' => fn ($c) => $c->type?->name,
                    'Project' => fn ($c) => $c->project?->name, 'Value' => fn ($c) => $c->contract_value, 'Start date' => fn ($c) => $c->start_date?->toDateString(),
                    'End date' => fn ($c) => $c->end_date?->toDateString(), 'Signed' => fn ($c) => (bool) ($c->signed || $c->marked_as_signed),
                ],
            ],
            'vendors' => [
                'name' => 'Vendors', 'date' => 'created_at', 'date_label' => 'Date created',
                'can' => fn (User $u) => $u->hasPermission('purchase_vendors', 'view'),
                'query' => fn () => Vendor::query(),
                'columns' => [
                    'Code' => fn ($v) => $v->vendor_code, 'Vendor' => fn ($v) => $v->name, 'GST / VAT' => fn ($v) => $v->vat, 'Phone' => fn ($v) => $v->phone,
                    'Email' => fn ($v) => $v->email, 'City' => fn ($v) => $v->city, 'State' => fn ($v) => $v->state, 'Country' => fn ($v) => $v->country, 'Active' => fn ($v) => (bool) $v->active,
                ],
            ],
            'purchase_invoices' => [
                'name' => 'Purchase bills', 'date' => 'invoice_date', 'date_label' => 'Bill date',
                'can' => fn (User $u) => $u->hasPermission('purchase_invoices', 'view'),
                'query' => fn () => PurchaseInvoice::query()->with('vendor:id,name')->withSum('payments', 'amount'),
                'columns' => [
                    'Bill #' => fn ($b) => $b->invoice_number, 'Vendor bill #' => fn ($b) => $b->vendor_invoice_number, 'Vendor' => fn ($b) => $b->vendor?->name,
                    'Bill date' => fn ($b) => $b->invoice_date?->toDateString(), 'Due date' => fn ($b) => $b->due_date?->toDateString(), 'Subtotal' => fn ($b) => $b->subtotal,
                    'Tax' => fn ($b) => $b->total_tax, 'Total' => fn ($b) => $b->total, 'Paid' => fn ($b) => $b->payments_sum_amount ?? 0, 'Payment status' => fn ($b) => $b->payment_status,
                ],
            ],
        ];
    }
}
