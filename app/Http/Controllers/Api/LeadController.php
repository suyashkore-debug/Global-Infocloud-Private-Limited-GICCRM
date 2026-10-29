<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\LeadResource;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
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
            ->when($request->has('status'), fn (Builder $q) => $q->whereIn('lead_status_id', array_map('intval', (array) $request->input('status'))))
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

        // Lost and junk leads are hidden unless asked for, as in Perfex.
        $request->boolean('lost') ? $base->where('lost', true) : ($request->boolean('junk') ? $base->where('junk', true) : $base->where('lost', false)->where('junk', false));

        $summary = (clone $base)->selectRaw('lead_status_id, count(*) as total, sum(lead_value) as value')->groupBy('lead_status_id')->get()->keyBy('lead_status_id');

        $query = $base->with(['status', 'source', 'assigned', 'tags', 'customer:id,name'])
            ->orderBy($request->boolean('kanban') ? 'lead_order' : 'id', $request->boolean('kanban') ? 'asc' : 'desc');

        $leads = $request->boolean('kanban') ? $query->limit(2000)->get() : $query->paginate($request->integer('per_page', 25));

        return LeadResource::collection($leads)->additional(['meta' => [
            'summary' => LeadStatus::orderBy('status_order')->get()->map(fn (LeadStatus $s) => [
                ...$s->only(['id', 'name', 'color', 'is_default']),
                'count' => (int) ($summary[$s->id]->total ?? 0),
                'value' => round((float) ($summary[$s->id]->value ?? 0), 2),
            ]),
        ]]);
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

        return new LeadResource($this->loadForView($this->leads->update($lead, $this->validated($request, $lead))));
    }

    public function destroy(Lead $lead): JsonResponse
    {
        $this->authorize('delete', $lead);
        $lead->attachments()->get()->each->delete();
        $lead->notes()->delete();
        $lead->reminders()->delete();
        $lead->delete();

        return response()->json(['message' => 'Lead deleted.']);
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
            'company' => ['nullable', 'string', 'max:300'],
            'description' => ['nullable', 'string', 'max:65000'],
            'email' => ['nullable', 'email', 'max:150', ...$unique('email')],
            'phone' => ['nullable', 'string', 'max:50', ...$unique('phone')],
            'website' => ['nullable', 'string', 'max:150', ...$unique('website')],
            'address' => ['nullable', 'string', 'max:200'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
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
        return $lead->load(['status', 'source', 'assigned', 'tags', 'customer:id,name', 'activities.user', 'notes.creator', 'reminders.user', 'attachments.user', 'proposals']);
    }
}
