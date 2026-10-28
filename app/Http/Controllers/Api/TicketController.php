<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TicketResource;
use App\Models\Customer;
use App\Models\Ticket;
use App\Models\TicketStatus;
use App\Services\DefaultLookups;
use App\Services\Options;
use App\Services\TicketService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class TicketController extends Controller
{
    public function __construct(private TicketService $tickets) {}

    /**
     * Perfex support list with the summary by status; closed tickets are hidden by default.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        DefaultLookups::ensureTicketLists();
        $user = $request->user();

        $base = Ticket::query()
            ->visibleTo($user)
            ->when($request->integer('customer_id'), fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($request->integer('project_id'), fn (Builder $q, int $id) => $q->where('project_id', $id))
            ->when($request->integer('department_id'), fn (Builder $q, int $id) => $q->where('support_department_id', $id))
            ->when($request->integer('priority_id'), fn (Builder $q, int $id) => $q->where('ticket_priority_id', $id))
            ->when($request->boolean('my_tickets'), fn (Builder $q) => $q->where('assigned_id', $user->id))
            ->when($request->boolean('unassigned'), fn (Builder $q) => $q->whereNull('assigned_id'))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->where('subject', 'like', "%{$s}%")
                ->orWhere('name', 'like', "%{$s}%")
                ->orWhere('email', 'like', "%{$s}%")
                ->when(ctype_digit($s), fn (Builder $q) => $q->orWhere('id', (int) $s))));

        $counts = (clone $base)->selectRaw('ticket_status_id, count(*) as total')->groupBy('ticket_status_id')->pluck('total', 'ticket_status_id');
        $closed = DefaultLookups::ticketStatus('closed')->id;

        $tickets = $base
            ->when($request->has('status'),
                fn (Builder $q) => $q->whereIn('ticket_status_id', array_map('intval', (array) $request->input('status'))),
                fn (Builder $q) => $q->where('ticket_status_id', '!=', $closed))
            ->with(['customer:id,name', 'contact', 'department', 'priority', 'status', 'service', 'assigned', 'tags'])
            ->orderByRaw('COALESCE(last_reply_at, created_at) desc')
            ->paginate($request->integer('per_page', 25));

        return TicketResource::collection($tickets)->additional(['meta' => [
            'summary' => TicketStatus::orderBy('status_order')->get()->map(fn (TicketStatus $s) => [
                ...$s->only(['id', 'name', 'color', 'system_key']),
                'count' => (int) ($counts[$s->id] ?? 0),
            ]),
        ]]);
    }

    public function store(Request $request): TicketResource
    {
        $this->authorize('create', Ticket::class);

        return new TicketResource($this->loadForView($this->tickets->open($this->validated($request, true))));
    }

    public function show(Ticket $ticket): TicketResource
    {
        $this->authorize('view', $ticket);
        $ticket->update(['admin_read' => true]);

        return new TicketResource($this->loadForView($ticket));
    }

    public function update(Request $request, Ticket $ticket): TicketResource
    {
        $this->authorize('update', $ticket);

        return new TicketResource($this->loadForView($this->tickets->update($ticket, $this->validated($request, false))));
    }

    public function destroy(Ticket $ticket): JsonResponse
    {
        $this->authorize('delete', $ticket);
        $ticket->attachments()->get()->each->delete();
        $ticket->replies()->with('attachments')->get()->each(fn ($r) => $r->attachments->each->delete());
        $ticket->notes()->delete();
        $ticket->delete();

        return response()->json(['message' => 'Ticket deleted.']);
    }

    /**
     * Staff reply, with attachments; the ticket takes the chosen status (default Answered).
     */
    public function reply(Request $request, Ticket $ticket): TicketResource
    {
        $this->authorize('update', $ticket);
        $data = $request->validate([
            'message' => ['required', 'string', 'max:65000'],
            'ticket_status_id' => ['nullable', 'integer', Rule::exists('ticket_statuses', 'id')->where('company_id', $request->user()->company_id)],
            ...TicketService::attachmentRules(),
        ]);

        $reply = $this->tickets->reply($ticket, $data['message'], isset($data['ticket_status_id']) ? TicketStatus::find($data['ticket_status_id']) : null);
        foreach ($request->file('files', []) as $file) {
            $reply->attachments()->create([
                'user_id' => $request->user()->id,
                'disk_path' => $file->store('attachments/'.$request->user()->company_id.'/tickets/'.$ticket->id, 'local'),
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ]);
        }

        return new TicketResource($this->loadForView($ticket->refresh()));
    }

    public function changeStatus(Request $request, Ticket $ticket): TicketResource
    {
        $this->authorize('update', $ticket);
        $data = $request->validate(['ticket_status_id' => ['required', 'integer', Rule::exists('ticket_statuses', 'id')->where('company_id', $request->user()->company_id)]]);

        $this->tickets->changeStatus($ticket, TicketStatus::findOrFail($data['ticket_status_id']));

        return new TicketResource($this->loadForView($ticket->refresh()));
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $creating): array
    {
        $company = $request->user()->company_id;
        $in = fn (string $table) => Rule::exists($table, 'id')->where('company_id', $company);

        return $request->validate([
            'subject' => ['required', 'string', 'max:300'],
            'message' => [$creating ? 'required' : 'sometimes', 'string', 'max:65000'],
            'contact_id' => ['nullable', 'integer', Rule::exists('contacts', 'id')->whereIn('customer_id', Customer::pluck('id'))],
            'name' => ['required_without:contact_id', 'nullable', 'string', 'max:191'],
            'email' => ['required_without:contact_id', 'nullable', 'email', 'max:191'],
            'cc' => ['nullable', 'string', 'max:191'],
            'support_department_id' => ['required', 'integer', $in('support_departments')],
            'ticket_priority_id' => ['required', 'integer', $in('ticket_priorities')],
            'ticket_status_id' => ['sometimes', 'integer', $in('ticket_statuses')],
            'ticket_service_id' => ['nullable', 'integer', $in('ticket_services')],
            'project_id' => ['nullable', 'integer', $in('projects')],
            'assigned_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)->where('is_active', true)],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
        ]);
    }

    private function loadForView(Ticket $ticket): Ticket
    {
        // Settings → Support "Ticket replies order".
        $order = Options::get('ticket_replies_order') === 'desc' ? 'desc' : 'asc';

        return $ticket->load(['customer:id,name', 'contact', 'department', 'priority', 'status', 'service', 'project:id,name', 'assigned', 'tags',
            'replies' => fn ($q) => $q->reorder()->orderBy('id', $order)->with(['user', 'contact', 'attachments.user']), 'notes.creator', 'attachments.user']);
    }
}
