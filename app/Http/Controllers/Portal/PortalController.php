<?php

namespace App\Http\Controllers\Portal;

use App\Enums\EstimateStatus;
use App\Enums\InvoiceStatus;
use App\Enums\ProjectStatus;
use App\Enums\ProposalStatus;
use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\CreditNote;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\KbArticle;
use App\Models\KbGroup;
use App\Models\Payment;
use App\Models\Project;
use App\Models\Proposal;
use App\Models\SupportDepartment;
use App\Models\Task;
use App\Models\TaskTimer;
use App\Models\Ticket;
use App\Models\TicketPriority;
use App\Models\User;
use App\Services\DefaultLookups;
use App\Services\Emails;
use App\Services\Notifier;
use App\Services\Options;
use App\Services\TicketService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Perfex customers area for a logged-in contact. Everything is limited to the contact's own
 * customer (and their portal permissions); the company scope comes from AuthenticateContact.
 */
class PortalController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        $customerId = $contact->customer_id;
        $invoices = $contact->canPortal('invoices') ? Invoice::where('customer_id', $customerId)->where('status', '!=', InvoiceStatus::Draft)->with('currency')->get() : collect();
        $unpaid = $invoices->whereIn('status', [InvoiceStatus::Unpaid, InvoiceStatus::PartiallyPaid, InvoiceStatus::Overdue]);

        return response()->json(['data' => [
            'invoices_unpaid' => $unpaid->count(),
            'invoices_overdue' => $invoices->where('status', InvoiceStatus::Overdue)->count(),
            'amount_due' => round($unpaid->sum(fn (Invoice $i) => $i->amountDue()), 2),
            'currency' => $invoices->first()?->currency?->only(['symbol', 'placement']),
            'estimates_waiting' => $contact->canPortal('estimates') ? Estimate::where('customer_id', $customerId)->where('status', EstimateStatus::Sent)->count() : null,
            'proposals_waiting' => $contact->canPortal('proposals') ? Proposal::where('customer_id', $customerId)->whereIn('status', [ProposalStatus::Open, ProposalStatus::Sent])->count() : null,
            'open_tickets' => $contact->canPortal('support') ? $this->tickets($contact)->whereHas('status', fn ($q) => $q->where('system_key', '!=', 'closed')->orWhereNull('system_key'))->count() : null,
            'projects_in_progress' => $contact->canPortal('projects') ? Project::where('customer_id', $customerId)->where('status', ProjectStatus::InProgress)->count() : null,
            'announcements' => Announcement::where('show_to_customers', true)->latest()->limit(5)->get()
                ->map(fn ($a) => ['id' => $a->id, 'name' => $a->name, 'message' => $a->message, 'created_at' => $a->created_at?->toIso8601String()]),
        ]]);
    }

    /**
     * Invoices, estimates, proposals and contracts: lists with links to their customer pages.
     */
    public function documents(Request $request, string $type): JsonResponse
    {
        $contact = $this->contact($request);
        $permission = ['invoices' => 'invoices', 'estimates' => 'estimates', 'proposals' => 'proposals', 'contracts' => 'contracts'][$type] ?? abort(404);
        abort_unless($contact->canPortal($permission), 403);
        $customerId = $contact->customer_id;

        $rows = match ($type) {
            'invoices' => Invoice::where('customer_id', $customerId)->where('status', '!=', InvoiceStatus::Draft)->with(['currency', 'payments', 'appliedCredits'])->orderByDesc('date')->get()
                ->map(fn (Invoice $i) => [
                    'id' => $i->id, 'number' => $i->formattedNumber(), 'date' => $i->date->toDateString(), 'due_date' => $i->due_date?->toDateString(),
                    'total' => (float) $i->total, 'amount_due' => $i->amountDue(), 'status' => $i->status->label(), 'status_id' => $i->status->value,
                    'currency' => $i->currency?->only(['symbol', 'placement']), 'link' => "/invoice/{$i->id}/{$i->hash}",
                ]),
            'estimates' => Estimate::where('customer_id', $customerId)->where('status', '!=', EstimateStatus::Draft)->with('currency')->orderByDesc('date')->get()
                ->map(fn (Estimate $e) => [
                    'id' => $e->id, 'number' => $e->formattedNumber(), 'date' => $e->date->toDateString(), 'expiry_date' => $e->expiry_date?->toDateString(),
                    'total' => (float) $e->total, 'status' => $e->status->label(), 'status_id' => $e->status->value,
                    'currency' => $e->currency?->only(['symbol', 'placement']), 'link' => "/estimate/{$e->id}/{$e->hash}",
                ]),
            'proposals' => Proposal::where('customer_id', $customerId)->where('status', '!=', ProposalStatus::Draft)->with('currency')->orderByDesc('date')->get()
                ->map(fn (Proposal $p) => [
                    'id' => $p->id, 'number' => $p->formattedNumber(), 'subject' => $p->subject, 'date' => $p->date->toDateString(), 'open_till' => $p->open_till?->toDateString(),
                    'total' => (float) $p->total, 'status' => $p->status->label(), 'status_id' => $p->status->value,
                    'currency' => $p->currency?->only(['symbol', 'placement']), 'link' => "/proposal/{$p->id}/{$p->hash}",
                ]),
            'contracts' => Contract::where('customer_id', $customerId)->where('trash', false)->where('not_visible_to_client', false)->with('type')->orderByDesc('start_date')->get()
                ->map(fn (Contract $c) => [
                    'id' => $c->id, 'subject' => $c->subject, 'type' => $c->type?->name, 'start_date' => $c->start_date?->toDateString(), 'end_date' => $c->end_date?->toDateString(),
                    'contract_value' => $c->contract_value !== null ? (float) $c->contract_value : null, 'signed' => (bool) ($c->signed || $c->marked_as_signed),
                    'link' => "/contract/{$c->id}/{$c->hash}",
                ]),
        };

        return response()->json(['data' => $rows->values()]);
    }

    /**
     * Perfex customer statement: invoices, payments and credit notes in a period with the
     * running balance.
     */
    public function statement(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        abort_unless($contact->canPortal('invoices'), 403);
        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date', 'after_or_equal:from']]);
        $customerId = $contact->customer_id;

        $invoices = Invoice::where('customer_id', $customerId)->whereNotIn('status', [InvoiceStatus::Draft, InvoiceStatus::Cancelled]);
        $payments = Payment::whereHas('invoice', fn ($q) => $q->where('customer_id', $customerId));
        $credits = CreditNote::where('customer_id', $customerId);

        $opening = (float) (clone $invoices)->whereDate('date', '<', $data['from'])->sum('total')
            - (float) (clone $payments)->whereDate('date', '<', $data['from'])->sum('amount')
            - (float) (clone $credits)->whereDate('date', '<', $data['from'])->sum('total');

        $lines = collect()
            ->concat((clone $invoices)->whereBetween('date', [$data['from'], $data['to']])->get()->map(fn (Invoice $i) => ['date' => $i->date->toDateString(), 'details' => 'Invoice '.$i->formattedNumber(), 'amount' => (float) $i->total, 'payment' => 0.0]))
            ->concat((clone $payments)->whereBetween('date', [$data['from'], $data['to']])->with('invoice')->get()->map(fn (Payment $p) => ['date' => $p->date->toDateString(), 'details' => 'Payment for '.$p->invoice->formattedNumber(), 'amount' => 0.0, 'payment' => (float) $p->amount]))
            ->concat((clone $credits)->whereBetween('date', [$data['from'], $data['to']])->get()->map(fn (CreditNote $n) => ['date' => $n->date->toDateString(), 'details' => 'Credit note '.$n->formattedNumber(), 'amount' => 0.0, 'payment' => (float) $n->total]))
            ->sortBy('date')->values();

        $balance = $opening;
        $lines = $lines->map(function ($line) use (&$balance) {
            $balance += $line['amount'] - $line['payment'];

            return [...$line, 'balance' => round($balance, 2)];
        });

        return response()->json(['data' => [
            'customer' => $contact->customer->only(['name', 'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country']),
            'opening_balance' => round($opening, 2),
            'invoiced' => round($lines->sum('amount'), 2),
            'paid' => round($lines->sum('payment'), 2),
            'balance_due' => round($balance, 2),
            'lines' => $lines,
        ]]);
    }

    // Support tickets ---------------------------------------------------------------------------

    public function ticketOptions(Request $request): JsonResponse
    {
        abort_unless($this->contact($request)->canPortal('support'), 403);

        return response()->json(['data' => [
            'departments' => SupportDepartment::where('hide_from_client', false)->orderBy('name')->get(['id', 'name']),
            'priorities' => TicketPriority::orderBy('id')->get(['id', 'name']),
        ]]);
    }

    public function ticketIndex(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        abort_unless($contact->canPortal('support'), 403);

        return response()->json(['data' => $this->tickets($contact)->with(['status', 'department', 'priority'])->orderByDesc('id')->get()
            ->map(fn (Ticket $t) => [
                'id' => $t->id, 'subject' => $t->subject, 'department' => $t->department?->name, 'priority' => $t->priority?->name,
                'status' => $t->status ? ['name' => $t->status->name, 'color' => $t->status->color] : null,
                'last_reply_at' => $t->last_reply_at?->toIso8601String(), 'created_at' => $t->created_at?->toIso8601String(),
            ])]);
    }

    public function ticketStore(Request $request, TicketService $tickets): JsonResponse
    {
        $contact = $this->contact($request);
        abort_unless($contact->canPortal('support'), 403);
        $company = $contact->customer->company_id;
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:191'],
            'message' => ['required', 'string', 'max:20000'],
            'support_department_id' => ['required', 'integer', Rule::exists('support_departments', 'id')->where('company_id', $company)->where('hide_from_client', false)],
            'ticket_priority_id' => ['required', 'integer', Rule::exists('ticket_priorities', 'id')->where('company_id', $company)],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('customer_id', $contact->customer_id)],
        ]);

        $ticket = $tickets->open([...$data, 'contact_id' => $contact->id, 'company_id' => $company], true);

        return response()->json(['data' => ['id' => $ticket->id]], 201);
    }

    public function ticketShow(Request $request, int $id): JsonResponse
    {
        $ticket = $this->ticket($request, $id);
        $ticket->load(['status', 'department', 'priority', 'replies']);
        $staff = User::whereIn('id', $ticket->replies->pluck('user_id')->filter()->unique())->pluck('full_name', 'id');

        return response()->json(['data' => [
            'id' => $ticket->id,
            'subject' => $ticket->subject,
            'message' => $ticket->message,
            'department' => $ticket->department?->name,
            'priority' => $ticket->priority?->name,
            'status' => $ticket->status ? ['name' => $ticket->status->name, 'color' => $ticket->status->color, 'closed' => $ticket->status->system_key === 'closed'] : null,
            'created_at' => $ticket->created_at?->toIso8601String(),
            'from' => $ticket->requesterName(),
            'replies' => (Options::get('ticket_replies_order', (int) $ticket->company_id) === 'desc' ? $ticket->replies->sortByDesc('id') : $ticket->replies->sortBy('id'))->values()->map(fn ($r) => [
                'id' => $r->id,
                'message' => $r->message,
                'author' => $r->user_id ? ($staff[$r->user_id] ?? 'Staff') : ($r->name ?: 'You'),
                'is_staff' => (bool) $r->user_id,
                'created_at' => $r->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    public function ticketReply(Request $request, int $id, TicketService $tickets): JsonResponse
    {
        $ticket = $this->ticket($request, $id);
        $message = $request->validate(['message' => ['required', 'string', 'max:20000']])['message'];
        $tickets->customerReply($ticket, $this->contact($request), $message);

        return response()->json(['message' => 'Reply sent.'], 201);
    }

    public function ticketClose(Request $request, int $id): JsonResponse
    {
        $ticket = $this->ticket($request, $id);
        abort_unless(Options::get('allow_customer_to_change_ticket_status', (int) $ticket->company_id) === '1', 403, 'Please ask us to close this ticket.');
        $ticket->update(['ticket_status_id' => DefaultLookups::ticketStatus('closed')->id]);

        return response()->json(['message' => 'Ticket closed.']);
    }

    // Projects ------------------------------------------------------------------------------------

    public function projectIndex(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        abort_unless($contact->canPortal('projects'), 403);

        return response()->json(['data' => Project::where('customer_id', $contact->customer_id)->orderByDesc('id')->get()
            ->map(fn (Project $p) => [
                'id' => $p->id, 'name' => $p->name, 'status' => $p->status->label(), 'status_id' => $p->status->value,
                'start_date' => $p->start_date?->toDateString(), 'deadline' => $p->deadline?->toDateString(), 'progress' => $p->calculatedProgress(),
            ])]);
    }

    public function projectShow(Request $request, int $id): JsonResponse
    {
        $project = $this->project($request, $id);
        $can = $project->customerSettings();
        $tasks = $can['view_tasks'] ? $project->tasks()->where('visible_to_client', true)->with(['assignees'])->orderBy('due_date')->get() : collect();
        $taskIds = $tasks->pluck('id');
        $timers = $can['view_timesheets'] ? TaskTimer::whereIn('task_id', $taskIds)->with('task:id,name')->orderByDesc('start_time')->get() : collect();
        $memberIds = $can['view_team_members'] ? $project->members()->pluck('user_id') : collect();
        $names = User::whereIn('id', $memberIds->concat($tasks->flatMap(fn ($t) => $t->assignees->pluck('user_id')))->concat($timers->pluck('user_id'))->unique())->pluck('full_name', 'id');

        return response()->json(['data' => [
            'id' => $project->id,
            'name' => $project->name,
            'description' => $project->description,
            'status' => $project->status->label(),
            'status_id' => $project->status->value,
            'start_date' => $project->start_date?->toDateString(),
            'deadline' => $project->deadline?->toDateString(),
            'progress' => $project->calculatedProgress(),
            'settings' => $can,
            'total_logged_seconds' => $can['view_task_total_logged_time'] ? $project->totalLoggedSeconds() : null,
            'tasks' => $tasks->map(fn (Task $t) => [
                'id' => $t->id, 'name' => $t->name, 'status' => $t->status->label(), 'status_id' => $t->status->value, 'priority' => $t->priority->label(),
                'start_date' => $t->start_date?->toDateString(), 'due_date' => $t->due_date?->toDateString(),
                'assignees' => $t->assignees->map(fn ($a) => $names[$a->user_id] ?? null)->filter()->values(),
            ])->values(),
            'milestones' => $can['view_milestones'] ? $project->milestones()->orderBy('due_date')->get(['id', 'name', 'description', 'due_date']) : [],
            'members' => $memberIds->map(fn ($uid) => ['id' => $uid, 'name' => $names[$uid] ?? null])->values(),
            'timesheets' => $timers->map(fn (TaskTimer $t) => [
                'task' => $t->task?->name, 'staff' => $names[$t->user_id] ?? null, 'start_time' => $t->start_time->toIso8601String(),
                'end_time' => $t->end_time?->toIso8601String(), 'seconds' => $t->durationSeconds(),
            ])->values(),
        ]]);
    }

    public function taskShow(Request $request, int $projectId, int $taskId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        $can = $project->customerSettings();
        abort_unless($can['view_tasks'], 403);
        $task = $project->tasks()->where('visible_to_client', true)->whereKey($taskId)->firstOrFail();
        $comments = $can['view_task_comments'] ? $task->comments()->with(['user', 'contact'])->orderBy('id')->get() : collect();

        return response()->json(['data' => [
            'id' => $task->id,
            'name' => $task->name,
            'description' => $task->description,
            'status' => $task->status->label(),
            'priority' => $task->priority->label(),
            'start_date' => $task->start_date?->toDateString(),
            'due_date' => $task->due_date?->toDateString(),
            'logged_seconds' => $can['view_task_total_logged_time'] ? $task->totalLoggedSeconds() : null,
            'checklist' => $can['view_task_checklist_items'] ? $task->checklistItems()->orderBy('list_order')->get(['id', 'description', 'finished']) : [],
            'can_comment' => $can['comment_on_tasks'],
            'comments' => $comments->map(fn ($c) => [
                'id' => $c->id,
                'content' => preg_replace('/@\[([^\]]+)\]\(\d+\)/', '@$1', (string) $c->content),
                'author' => $c->contact ? $c->contact->fullName() : ($c->user?->full_name ?? 'Staff'),
                'is_customer' => (bool) $c->contact_id,
                'created_at' => $c->created_at?->toIso8601String(),
            ])->values(),
        ]]);
    }

    public function taskComment(Request $request, int $projectId, int $taskId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        abort_unless($project->customerCan('view_tasks') && $project->customerCan('comment_on_tasks'), 403);
        $task = $project->tasks()->where('visible_to_client', true)->whereKey($taskId)->firstOrFail();
        $content = $request->validate(['content' => ['required', 'string', 'max:10000']])['content'];
        $contact = $this->contact($request);

        $task->comments()->create(['contact_id' => $contact->id, 'content' => $content]);
        $staff = $task->assignees()->pluck('user_id')->merge($task->followers()->pluck('user_id'));
        app(Notifier::class)->notify($staff, "{$contact->fullName()} (customer) commented on task {$task->name}", "/tasks?task={$task->id}", (int) $task->company_id);
        Emails::toStaff('task-commented', (int) $task->company_id, $staff, [...Emails::task($task), 'task_comment' => $content, 'task_user_take_action' => $contact->fullName()], $task);

        return response()->json(['message' => 'Comment added.'], 201);
    }

    // Knowledge base ------------------------------------------------------------------------------

    public function knowledgeBase(Request $request): JsonResponse
    {
        abort_unless(Options::get('use_knowledge_base', (int) $this->contact($request)->customer->company_id) === '1', 404);
        $this->contact($request);

        return response()->json(['data' => KbGroup::where('active', true)->orderBy('group_order')->get()->map(fn (KbGroup $g) => [
            'id' => $g->id, 'name' => $g->name, 'description' => $g->description, 'color' => $g->color,
            'articles' => KbArticle::where('kb_group_id', $g->id)->where('active', true)->where('staff_article', false)->orderBy('article_order')->get(['id', 'subject']),
        ])->filter(fn ($g) => $g['articles']->isNotEmpty())->values()]);
    }

    public function article(Request $request, int $id): JsonResponse
    {
        $this->contact($request);
        $article = KbArticle::where('active', true)->where('staff_article', false)->findOrFail($id);
        $article->increment('views');

        return response()->json(['data' => $article->only(['id', 'subject', 'description', 'updated_at'])]);
    }

    // Profile & company ---------------------------------------------------------------------------

    public function updateProfile(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        $contact->update($request->validate([
            'first_name' => ['required', 'string', 'max:191'],
            'last_name' => ['nullable', 'string', 'max:191'],
            'phone' => ['nullable', 'string', 'max:100'],
            'title' => ['nullable', 'string', 'max:200'],
        ]));

        return response()->json(['message' => 'Profile updated.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        $data = $request->validate(['old_password' => ['required', 'string'], 'password' => ['required', 'confirmed', Password::min(8)]]);
        if (! Hash::check($data['old_password'], (string) $contact->password)) {
            return response()->json(['message' => 'The current password is wrong.', 'errors' => ['old_password' => ['The current password is wrong.']]], 422);
        }
        $contact->update(['password' => $data['password'], 'last_password_change_at' => now()]);

        return response()->json(['message' => 'Password changed.']);
    }

    public function company(Request $request): JsonResponse
    {
        $customer = $this->contact($request)->customer;

        return response()->json(['data' => $customer->only(['name', 'phone', 'website', 'vat', 'address', 'city', 'state', 'zip', 'country',
            'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country', 'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country'])]);
    }

    /**
     * Perfex lets the primary contact update the company details.
     */
    public function updateCompany(Request $request): JsonResponse
    {
        $contact = $this->contact($request);
        abort_unless($contact->is_primary, 403, 'Only the primary contact can change the company details.');
        abort_unless(Options::get('allow_primary_contact_to_view_edit_billing_and_shipping', (int) $contact->customer->company_id) === '1', 403, 'Company details cannot be changed here. Please contact us.');
        $fields = ['phone', 'website', 'address', 'city', 'state', 'zip', 'country', 'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
            'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country'];
        $contact->customer->update($request->validate(array_fill_keys($fields, ['nullable', 'string', 'max:191'])));

        return response()->json(['message' => 'Company details updated.']);
    }

    // Helpers -------------------------------------------------------------------------------------

    private function contact(Request $request): Contact
    {
        return $request->attributes->get('contact');
    }

    /**
     * Tickets the contact may see: their own, or all of the customer's for the primary contact.
     *
     * @return Builder<Ticket>
     */
    private function tickets(Contact $contact): Builder
    {
        // Settings → Support "Only show tickets of the logged in contact".
        $ownOnly = Options::get('only_show_contact_tickets', (int) $contact->customer->company_id) === '1';

        return Ticket::where('customer_id', $contact->customer_id)->when($ownOnly, fn ($q) => $q->where('contact_id', $contact->id));
    }

    private function ticket(Request $request, int $id): Ticket
    {
        $contact = $this->contact($request);
        abort_unless($contact->canPortal('support'), 403);

        return $this->tickets($contact)->whereKey($id)->firstOrFail();
    }

    private function project(Request $request, int $id): Project
    {
        $contact = $this->contact($request);
        abort_unless($contact->canPortal('projects'), 403);

        return Project::where('customer_id', $contact->customer_id)->whereKey($id)->firstOrFail();
    }
}
