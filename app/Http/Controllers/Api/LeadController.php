<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\LeadResource;
use App\Models\EmailLog;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\LeadStatus;
use App\Models\User;
use App\Services\DefaultLookups;
use App\Services\LeadFilterRules;
use App\Services\LeadService;
use App\Services\Options;
use App\Support\CompanyTime;
use App\Support\PhoneNumber;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    /** Columns the list can be sorted by. */
    private const SORTABLE = ['created_at', 'updated_at', 'last_contact_at', 'next_follow_up_at', 'last_status_change_at', 'assigned_at', 'name', 'company', 'lead_value'];

    public function __construct(private LeadService $leads) {}

    /**
     * Leads table / kanban with Perfex's filters (status, source, assigned, lost, junk, public,
     * contacted today, not assigned) and the summary by status.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        DefaultLookups::ensureLeadLists();
        $user = $request->user();

        $base = Lead::query()
            ->visibleTo($user)
            ->when($request->integer('source_id'), fn (Builder $q, int $id) => $q->where('lead_source_id', $id))
            ->when($request->integer('assigned_id'), fn (Builder $q, int $id) => $q->where('assigned_id', $id))
            ->when($request->boolean('my_leads'), fn (Builder $q) => $q->where('assigned_id', $user->id))
            ->when($request->boolean('not_assigned'), fn (Builder $q) => $q->whereNull('assigned_id'))
            ->when($request->boolean('public'), fn (Builder $q) => $q->where('is_public', true))
            ->when($request->boolean('contacted_today'), fn (Builder $q) => $q->whereDate('last_contact_at', today()))
            ->when($request->boolean('created_today'), fn (Builder $q) => $q->whereDate('created_at', today()))
            ->when($request->string('search')->trim()->value(), fn (Builder $q, string $s) => $q->where(fn (Builder $q) => $q
                ->where('name', 'like', "%{$s}%")
                ->orWhere('company', 'like', "%{$s}%")
                ->orWhere('email', 'like', "%{$s}%")
                ->orWhere('phone', 'like', "%{$s}%")
                ->orWhereHas('tags', fn (Builder $t) => $t->where('name', 'like', "%{$s}%"))));

        // Perfex "Filters": rules of field, operator and value.
        $rules = LeadFilterRules::parse($request->input('rules'));
        LeadFilterRules::apply($base, $rules);

        // Lost and junk leads are hidden unless asked for (here or in the rules), as in Perfex.
        if ($request->boolean('lost')) {
            $base->where('lost', true);
        } elseif ($request->boolean('junk')) {
            $base->where('junk', true);
        } elseif (! LeadFilterRules::touchesFlags($rules)) {
            $base->where('lost', false)->where('junk', false);
        }

        $summary = (clone $base)->selectRaw('lead_status_id, count(*) as total, sum(lead_value) as value')->groupBy('lead_status_id')->get()->keyBy('lead_status_id');

        // Pipelines (TeleCRM workspaces): the ones this person works in, each with its count; with
        // more than one, the list and kanban show one pipeline (the one asked for, else the default).
        DefaultLookups::ensureLeadLists();
        $statuses = LeadStatus::orderBy('status_order')->get();
        $pipelines = LeadPipeline::listFor($user);
        $pipeline = $pipelines->firstWhere('id', $request->integer('pipeline_id')) ?? LeadPipeline::current($user) ?? $pipelines->firstWhere('is_default', true) ?? $pipelines->first();
        if ($pipeline) {
            $statuses = $statuses->where('pipeline_id', $pipeline->id)->values();
            $base->whereIn('lead_status_id', $statuses->pluck('id'));
        }
        $pipelineMeta = $pipelines->map(fn (LeadPipeline $p) => [
            ...$p->only(['id', 'name', 'color', 'is_default']),
            'count' => (int) LeadStatus::where('pipeline_id', $p->id)->pluck('id')->sum(fn ($id) => (int) ($summary[$id]->total ?? 0)),
        ]);

        // Picked status chips filter the rows; the chips keep counting every status.
        $base->when($request->has('status'), fn (Builder $q) => $q->whereIn('lead_status_id', array_map('intval', (array) $request->input('status'))));
        $base->with(['status', 'source', 'assigned', 'tags', 'customer:id,name'])->withCount(['notes', 'attachments']);

        $leads = $request->boolean('kanban') ? $this->kanbanColumns($base, $request, $statuses->pluck('id')) : $this->sorted(clone $base, $request)->paginate(min(100, max(10, $request->integer('per_page', 25))));

        return LeadResource::collection($leads)->additional(['meta' => [
            'pipelines' => $pipelineMeta,
            'pipeline_id' => $pipeline?->id,
            'summary' => $statuses->map(fn (LeadStatus $s) => [
                ...$s->only(['id', 'name', 'color', 'is_default']),
                'count' => (int) ($summary[$s->id]->total ?? 0),
                'value' => round((float) ($summary[$s->id]->value ?? 0), 2),
            ]),
        ]]);
    }

    /**
     * The lead workspaces for the header's switcher: each with its open leads this person sees.
     */
    public function workspaces(Request $request): JsonResponse
    {
        DefaultLookups::ensureLeadLists();
        $user = $request->user();
        $counts = Lead::query()->visibleTo($user)->where('lost', false)->where('junk', false)
            ->join('lead_statuses', 'lead_statuses.id', '=', 'leads.lead_status_id')
            ->selectRaw('lead_statuses.pipeline_id, count(*) as n')->groupBy('lead_statuses.pipeline_id')->pluck('n', 'pipeline_id');

        return response()->json(['data' => LeadPipeline::listFor($user)->map(fn (LeadPipeline $p) => [
            ...$p->only(['id', 'name', 'color', 'is_default']),
            'count' => (int) ($counts[$p->id] ?? 0),
        ])]);
    }

    /**
     * Kanban: each status column's leads in Setup → Leads order (kanban order, date created or last
     * contact; ascending or descending), at most "Limit leads kanban rows per status" per column.
     *
     * The kanban's "Sort by" (kanban_sort, kanban_dir) overrides the setting; "Load more" asks for
     * more rows of one column (more[<status id>] = how many extra).
     *
     * @param  Builder<Lead>  $base
     * @return \Illuminate\Support\Collection<int, Lead>
     */
    private function kanbanColumns(Builder $base, Request $request, \Illuminate\Support\Collection $statusIds)
    {
        $columns = ['dateadded' => 'created_at', 'lastcontact' => 'last_contact_at', 'leadorder' => 'lead_order'];
        $sort = $request->input('kanban_sort', Options::get('default_leads_kanban_sort'));
        $column = $columns[$sort] ?? 'lead_order';
        $direction = $request->input('kanban_dir', Options::get('default_leads_kanban_sort_type')) === 'desc' ? 'desc' : 'asc';
        $limit = max(1, min(500, (int) Options::get('leads_kanban_limit') ?: 50));
        $more = array_map('intval', (array) $request->input('more', []));

        return $statusIds->flatMap(fn ($statusId) => (clone $base)
            ->where('lead_status_id', $statusId)
            ->orderBy($column, $direction)->orderBy('id', $direction)
            ->limit(min(2000, $limit + max(0, $more[$statusId] ?? 0)))->get());
    }

    /**
     * The list's "Sort by" (sort, dir); newest first by default.
     *
     * @param  Builder<Lead>  $query
     * @return Builder<Lead>
     */
    private function sorted(Builder $query, Request $request): Builder
    {
        $column = in_array($request->input('sort'), self::SORTABLE, true) ? $request->input('sort') : 'created_at';
        $direction = $request->input('dir') === 'asc' ? 'asc' : 'desc';
        // Empty values last either way (e.g. never contacted).
        $query->orderByRaw("{$column} is null")->orderBy($column, $direction);

        return $query->orderBy('id', $direction);
    }

    public function store(Request $request): LeadResource
    {
        $this->authorize('create', Lead::class);

        return new LeadResource($this->loadForView($this->leads->create($this->validated($request, null))));
    }

    public function show(Lead $lead): LeadResource
    {
        $this->authorize('view', $lead);
        // Opened from another workspace (a link): the app switches to the lead's.
        if ($workspace = LeadStatus::whereKey($lead->lead_status_id)->value('pipeline_id')) {
            \App\Support\Workspace::open((int) $workspace);
        }

        return new LeadResource($this->loadForView($lead));
    }

    public function update(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('update', $lead);
        $oldEmail = $lead->email;
        $lead = $this->leads->update($lead, $this->validated($request, $lead));
        // Perfex: when the e-mail changes, the user may choose to move the lead's proposals to it too.
        if ($request->boolean('update_proposal_emails') && $lead->email !== $oldEmail) {
            $lead->proposals()->update(['email' => $lead->email]);
        }

        return new LeadResource($this->loadForView($lead));
    }

    public function destroy(Lead $lead): JsonResponse
    {
        $this->authorize('delete', $lead);
        $this->deleteLead($lead);

        return response()->json(['message' => 'Lead deleted.']);
    }

    /**
     * Perfex bulk actions on the selected leads: mass delete, or any of move to status / source,
     * last contact, assign, tags, public or private, and mark as lost. Leads the user may not change
     * (or delete) are skipped.
     */
    public function bulk(Request $request): JsonResponse
    {
        $company = $request->user()->company_id;
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:1000'],
            'ids.*' => ['integer'],
            'mass_delete' => ['boolean'],
            'lead_status_id' => ['nullable', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company)],
            'lead_source_id' => ['nullable', 'integer', Rule::exists('lead_sources', 'id')->where('company_id', $company)],
            'assigned_id' => ['nullable', 'integer', Rule::exists('crm_users', 'id')->where('company_id', $company)->where('is_active', true)],
            'last_contact_at' => ['nullable', 'date'],
            'next_follow_up_at' => ['nullable', 'date'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:100'],
            'visibility' => ['nullable', Rule::in(['public', 'private'])],
            'lost' => ['boolean'],
        ]);

        $done = 0;
        foreach (Lead::whereIn('id', $data['ids'])->get() as $lead) {
            if (! empty($data['mass_delete'])) {
                if ($request->user()->can('delete', $lead)) {
                    $this->deleteLead($lead);
                    $done++;
                }

                continue;
            }
            if (! $request->user()->can('update', $lead)) {
                continue;
            }
            $changes = array_filter([
                'lead_status_id' => $data['lead_status_id'] ?? null,
                'lead_source_id' => $data['lead_source_id'] ?? null,
                'assigned_id' => $data['assigned_id'] ?? null,
                'last_contact_at' => $data['last_contact_at'] ?? null,
                'next_follow_up_at' => $data['next_follow_up_at'] ?? null,
                'is_public' => isset($data['visibility']) ? $data['visibility'] === 'public' : null,
            ], fn ($v) => $v !== null);
            if (! empty($data['tags'])) {
                $changes['tags'] = $data['tags'];
            }
            if ($changes) {
                $this->leads->update($lead, $changes);
            }
            if (! empty($data['lost']) && ! $lead->lost) {
                $this->leads->setFlag($lead, 'lost', true);
            }
            $done++;
        }

        return response()->json(['message' => ! empty($data['mass_delete']) ? "Total leads deleted: {$done}" : "{$done} lead".($done === 1 ? '' : 's').' updated.', 'count' => $done]);
    }

    private function deleteLead(Lead $lead): void
    {
        $lead->attachments()->get()->each->delete();
        $lead->notes()->delete();
        $lead->reminders()->delete();
        $lead->delete();
    }

    /**
     * Kanban drop: the column (status) and the order of its cards.
     */
    public function move(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_status_id' => ['required', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $request->user()->company_id)],
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        $this->leads->moveToStatus(LeadStatus::findOrFail($data['lead_status_id']), $data['order'], $request->user());

        return response()->json(['message' => 'Saved.']);
    }

    /**
     * Perfex "Email activity": e-mails sent to this lead, and to its e-mail address from elsewhere
     * (a proposal, a notification), newest first.
     */
    public function emails(Lead $lead): JsonResponse
    {
        $this->authorize('view', $lead);
        $logs = EmailLog::query()
            ->where(fn (Builder $q) => $q->where(fn (Builder $r) => $r->where('rel_type', 'lead')->where('rel_id', $lead->id))
                ->when($lead->email, fn (Builder $e) => $e->orWhere('to', $lead->email)))
            ->latest('id')->limit(100)->get();
        $names = User::whereIn('id', $logs->pluck('user_id')->filter()->unique())->pluck('full_name', 'id');

        return response()->json(['data' => $logs->map(fn (EmailLog $m) => [
            'id' => $m->id, 'subject' => $m->subject, 'to' => $m->to, 'template' => $m->template, 'status' => $m->status,
            'error' => $m->error, 'sent_by' => $m->user_id ? ($names[$m->user_id] ?? null) : null, 'created_at' => $m->created_at,
        ])]);
    }

    /**
     * Follow-ups due for the leads this person can see: overdue, later today, and the next 7 days.
     */
    public function followUpSummary(Request $request): JsonResponse
    {
        $zone = CompanyTime::zone();
        $startOfToday = Carbon::now($zone)->startOfDay()->utc();
        $endOfToday = Carbon::now($zone)->endOfDay()->utc();
        $base = Lead::query()->visibleTo($request->user())->inWorkspace($request->user())->whereNotNull('next_follow_up_at');

        return response()->json(['data' => [
            'overdue' => (clone $base)->where('next_follow_up_at', '<', now())->count(),
            'today' => (clone $base)->whereBetween('next_follow_up_at', [$startOfToday, $endOfToday])->count(),
            'next_7_days' => (clone $base)->whereBetween('next_follow_up_at', [$startOfToday, Carbon::now($zone)->addDays(6)->endOfDay()->utc()])->count(),
            'mine_overdue' => (clone $base)->where('assigned_id', $request->user()->id)->where('next_follow_up_at', '<', now())->count(),
        ]]);
    }

    /**
     * Set, move or finish the lead's next follow-up.
     */
    public function followUp(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('update', $lead);
        $data = $request->validate([
            'next_follow_up_at' => ['nullable', 'date'],
            'follow_up_note' => ['nullable', 'string', 'max:500'],
            'done' => ['boolean'],
            'outcome' => ['nullable', 'string', 'max:500'],
        ]);

        return new LeadResource($this->loadForView($this->leads->followUp($lead, $data)));
    }

    public function flag(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('update', $lead);
        $data = $request->validate([
            'flag' => ['required', Rule::in(['lost', 'junk'])],
            'value' => ['required', 'boolean'],
        ]);

        $this->leads->setFlag($lead, $data['flag'], (bool) $data['value']);

        return new LeadResource($this->loadForView($lead->refresh()));
    }

    /**
     * Perfex "Enter activity": a line the user writes on the lead's activity log.
     */
    public function addActivity(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('view', $lead);
        $data = $request->validate(['description' => ['required', 'string', 'max:2000']]);
        $lead->logActivity(trim($data['description']), true);

        return new LeadResource($this->loadForView($lead->refresh()));
    }

    /**
     * Qualification checklist / star rating: the criteria the lead meets.
     */
    public function qualify(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('update', $lead);
        $data = $request->validate([
            'criteria' => ['present', 'array'],
            'criteria.*' => [Rule::in(Lead::QUALIFICATION)],
        ]);

        $before = $lead->rating();
        $lead->update(['qualification' => array_values(array_intersect(Lead::QUALIFICATION, $data['criteria']))]);
        if ($lead->rating() !== $before) {
            $lead->logActivity("Rating changed to {$lead->rating()}/5");
        }

        return new LeadResource($this->loadForView($lead->refresh()));
    }

    public function convert(Request $request, Lead $lead): CustomerResource
    {
        $this->authorize('update', $lead);
        abort_unless($request->user()->hasPermission('customers', 'create'), 403);

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'contact_first_name' => ['required', 'string', 'max:191'],
            'contact_last_name' => ['nullable', 'string', 'max:191'],
            'email' => ['required', 'email', 'max:191'],
            'phone' => ['nullable', 'string', 'max:100'],
            'title' => ['nullable', 'string', 'max:200'],
            'password' => ['nullable', 'string', 'min:8', 'max:191'],
            'send_set_password_email' => ['boolean'],
            'transfer_notes' => ['boolean'],
            'copy_custom_fields' => ['boolean'],
        ]);

        return new CustomerResource($this->leads->convertToCustomer($lead, $data)->load('primaryContact'));
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Lead $current = null): array
    {
        $company = $request->user()->company_id;

        // Settings → Leads "Unique validation": no second lead with the same e-mail / phone / website.
        $unique = fn (string $column) => in_array($column, explode(',', Options::get('lead_unique_validation')), true)
            ? [Rule::unique('leads', $column)->where('company_id', $company)->ignore($current?->id)]
            : [];

        return $request->validate([
            // First and last name (the form), or the full name (API, older clients).
            'first_name' => ['required_without:name', 'nullable', 'string', 'max:191'],
            'last_name' => ['nullable', 'string', 'max:191'],
            'name' => ['required_without:first_name', 'nullable', 'string', 'max:300'],
            'title' => ['nullable', 'string', 'max:100'],
            'company' => ['nullable', 'string', 'max:300', ...$unique('company')],
            'description' => ['nullable', 'string', 'max:65000'],
            // Every lead has its own e-mail: required for a new lead (and once a lead has one), never
            // the same as another lead's (any case).
            'email' => [$current === null || $current->email ? 'required' : 'nullable', 'email', 'max:150', function (string $attribute, mixed $value, \Closure $fail) use ($current) {
                $twin = Lead::query()->whereRaw('lower(email) = ?', [mb_strtolower(trim((string) $value))])
                    ->when($current, fn (Builder $q) => $q->whereKeyNot($current->id))->first(['id', 'name']);
                if ($twin) {
                    $fail("Lead #{$twin->id} {$twin->name} already has this e-mail address.");
                }
            }],
            // Phones compared by their digits: "+91 98765 43210" repeats "9876543210".
            'phone' => ['nullable', 'string', 'max:50', ...(in_array('phone', explode(',', Options::get('lead_unique_validation')), true) ? [function (string $attribute, mixed $value, \Closure $fail) use ($current) {
                $key = PhoneNumber::key((string) $value);
                if ($key === '') {
                    return;
                }
                $twin = Lead::query()->where('phone', 'like', '%'.substr($key, -4).'%')->when($current, fn (Builder $q) => $q->whereKeyNot($current->id))
                    ->get(['id', 'name', 'phone'])->first(fn (Lead $l) => PhoneNumber::key($l->phone) === $key);
                if ($twin) {
                    $fail("Lead #{$twin->id} {$twin->name} already has this phone number.");
                }
            }] : [])],
            'website' => ['nullable', 'string', 'max:150', ...$unique('website')],
            'address' => ['nullable', 'string', 'max:200'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
            'default_language' => ['nullable', 'string', 'max:40'],
            'lead_status_id' => ['required', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company)],
            'lead_source_id' => ['required', 'integer', Rule::exists('lead_sources', 'id')->where('company_id', $company)],
            'assigned_id' => ['nullable', 'integer', Rule::exists('crm_users', 'id')->where('company_id', $company)->where('is_active', true)],
            'lead_value' => ['nullable', 'numeric', 'min:0'],
            'is_public' => ['boolean'],
            'last_contact_at' => ['nullable', 'date'],
            'next_follow_up_at' => ['nullable', 'date'],
            'follow_up_note' => ['nullable', 'string', 'max:500'],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
        ]);
    }

    private function loadForView(Lead $lead): Lead
    {
        return $lead->loadCount([
            'tasks',
            'whatsappMessages as whatsapp_count',
            'whatsappMessages as whatsapp_unread_count' => fn (Builder $q) => $q->where('direction', 'in')->whereNull('read_at'),
            'calls as calls_count',
            'calls as calls_new_count' => fn (Builder $q) => $q->whereNull('seen_at'),
        ])->load(['status', 'source', 'leadForm:id,name', 'assigned', 'tags', 'customer:id,name', 'activities.user', 'notes.creator', 'reminders.user', 'attachments.user', 'proposals']);
    }
}
