<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\LeadResource;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
use App\Services\LeadFilterRules;
use App\Services\LeadService;
use App\Services\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
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

        // Picked status chips filter the rows; the chips keep counting every status.
        $base->when($request->has('status'), fn (Builder $q) => $q->whereIn('lead_status_id', array_map('intval', (array) $request->input('status'))));
        $base->with(['status', 'source', 'assigned', 'tags', 'customer:id,name'])->withCount(['notes', 'attachments']);

        $leads = $request->boolean('kanban') ? $this->kanbanColumns($base, $request) : (clone $base)->orderBy('id', 'desc')->paginate($request->integer('per_page', 25));

        return LeadResource::collection($leads)->additional(['meta' => [
            'summary' => LeadStatus::orderBy('status_order')->get()->map(fn (LeadStatus $s) => [
                ...$s->only(['id', 'name', 'color', 'is_default']),
                'count' => (int) ($summary[$s->id]->total ?? 0),
                'value' => round((float) ($summary[$s->id]->value ?? 0), 2),
            ]),
        ]]);
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
    private function kanbanColumns(Builder $base, Request $request)
    {
        $columns = ['dateadded' => 'created_at', 'lastcontact' => 'last_contact_at', 'leadorder' => 'lead_order'];
        $sort = $request->input('kanban_sort', Options::get('default_leads_kanban_sort'));
        $column = $columns[$sort] ?? 'lead_order';
        $direction = $request->input('kanban_dir', Options::get('default_leads_kanban_sort_type')) === 'desc' ? 'desc' : 'asc';
        $limit = max(1, min(500, (int) Options::get('leads_kanban_limit') ?: 50));
        $more = array_map('intval', (array) $request->input('more', []));

        return LeadStatus::orderBy('status_order')->pluck('id')->flatMap(fn ($statusId) => (clone $base)
            ->where('lead_status_id', $statusId)
            ->orderBy($column, $direction)->orderBy('id', $direction)
            ->limit(min(2000, $limit + max(0, $more[$statusId] ?? 0)))->get());
    }

    public function store(Request $request): LeadResource
    {
        $this->authorize('create', Lead::class);

        return new LeadResource($this->loadForView($this->leads->create($this->validated($request, null))));
    }

    public function show(Lead $lead): LeadResource
    {
        $this->authorize('view', $lead);

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
            'assigned_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)->where('is_active', true)],
            'last_contact_at' => ['nullable', 'date'],
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
            'name' => ['required', 'string', 'max:300'],
            'title' => ['nullable', 'string', 'max:100'],
            'company' => ['nullable', 'string', 'max:300', ...$unique('company')],
            'description' => ['nullable', 'string', 'max:65000'],
            'email' => ['nullable', 'email', 'max:150', ...$unique('email')],
            'phone' => ['nullable', 'string', 'max:50', ...$unique('phone')],
            'website' => ['nullable', 'string', 'max:150', ...$unique('website')],
            'address' => ['nullable', 'string', 'max:200'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
            'default_language' => ['nullable', 'string', 'max:40'],
            'lead_status_id' => ['required', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company)],
            'lead_source_id' => ['required', 'integer', Rule::exists('lead_sources', 'id')->where('company_id', $company)],
            'assigned_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)->where('is_active', true)],
            'lead_value' => ['nullable', 'numeric', 'min:0'],
            'is_public' => ['boolean'],
            'last_contact_at' => ['nullable', 'date'],
            'tags' => ['array'],
            'tags.*' => ['string', 'max:100'],
        ]);
    }

    private function loadForView(Lead $lead): Lead
    {
        return $lead->loadCount('tasks')->load(['status', 'source', 'leadForm:id,name', 'assigned', 'tags', 'customer:id,name', 'activities.user', 'notes.creator', 'reminders.user', 'attachments.user', 'proposals']);
    }
}
