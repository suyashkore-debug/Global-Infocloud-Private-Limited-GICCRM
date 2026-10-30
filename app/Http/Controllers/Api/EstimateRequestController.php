<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\Customer;
use App\Models\CustomerAdmin;
use App\Models\EstimateRequest;
use App\Models\EstimateRequestForm;
use App\Models\EstimateRequestStatus;
use App\Models\User;
use App\Services\DefaultLookups;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Perfex Estimate Request: requests from public web forms, their statuses and assignment,
 * converting one into an estimate or proposal, and managing the forms (admins).
 */
class EstimateRequestController extends Controller
{
    public const FIELD_TYPES = ['text', 'email', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file'];

    public function __construct(private Notifier $notifier) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EstimateRequest::class);
        DefaultLookups::ensureEstimateRequestStatuses();
        $user = $request->user();

        $query = EstimateRequest::query()
            ->when(! $user->hasPermission('estimate_request', 'view'), fn ($q) => $q->where('assigned_id', $user->id))
            ->when($request->integer('status'), fn ($q, $s) => $q->where('estimate_request_status_id', $s))
            ->when($request->integer('assigned_id'), fn ($q, $a) => $q->where('assigned_id', $a))
            ->when($request->integer('form_id'), fn ($q, $f) => $q->where('estimate_request_form_id', $f))
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('email', 'like', "%{$s}%")->orWhere('submission', 'like', "%{$s}%")));

        $summary = EstimateRequestStatus::orderBy('status_order')->get()->map(fn ($s) => [
            'id' => $s->id, 'name' => $s->name, 'color' => $s->color, 'flag' => $s->flag,
            'count' => (clone $query)->where('estimate_request_status_id', $s->id)->count(),
        ]);

        $page = (clone $query)->with(['status', 'form:id,name', 'tags'])->latest()->paginate(25);
        $assigned = User::whereIn('id', collect($page->items())->pluck('assigned_id')->filter()->unique())->get(['id', 'full_name'])->keyBy('id');

        return response()->json([
            'data' => collect($page->items())->map(fn ($r) => $this->row($r, $assigned[$r->assigned_id] ?? null)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'summary' => $summary],
        ]);
    }

    public function show(EstimateRequest $estimateRequest): JsonResponse
    {
        $this->authorize('view', $estimateRequest);

        return response()->json(['data' => $this->detail($estimateRequest)]);
    }

    /**
     * Change the status, the assigned staff member and / or the tags.
     */
    public function update(Request $request, EstimateRequest $estimateRequest): JsonResponse
    {
        $this->authorize('update', $estimateRequest);
        $data = $request->validate([
            'estimate_request_status_id' => ['sometimes', 'integer', Rule::exists('estimate_request_statuses', 'id')->where('company_id', $request->user()->company_id)],
            'assigned_id' => ['sometimes', 'nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string', 'max:100'],
        ]);

        if (array_key_exists('estimate_request_status_id', $data) && (int) $data['estimate_request_status_id'] !== (int) $estimateRequest->estimate_request_status_id) {
            $estimateRequest->fill(['estimate_request_status_id' => $data['estimate_request_status_id'], 'last_status_change_at' => now()]);
        }
        if (array_key_exists('assigned_id', $data) && (int) $data['assigned_id'] !== (int) $estimateRequest->assigned_id) {
            $estimateRequest->assigned_id = $data['assigned_id'];
            if ($data['assigned_id']) {
                $this->notifier->notify([$data['assigned_id']], "Estimate request #{$estimateRequest->id} has been assigned to you", "/estimate-requests/{$estimateRequest->id}");
            }
        }
        $estimateRequest->save();
        if (array_key_exists('tags', $data)) {
            $estimateRequest->syncTagNames($data['tags']);
        }

        return response()->json(['data' => $this->detail($estimateRequest->refresh())]);
    }

    public function destroy(EstimateRequest $estimateRequest): JsonResponse
    {
        $this->authorize('delete', $estimateRequest);
        DB::transaction(function () use ($estimateRequest) {
            $estimateRequest->attachments->each->delete();
            $estimateRequest->tags()->detach();
            $estimateRequest->delete();
        });

        return response()->json(['message' => 'Estimate request deleted.']);
    }

    /**
     * Perfex "Convert": pick an existing customer or create one from the request, then the
     * estimate / proposal form opens prefilled for it (the request is completed when that is saved).
     */
    public function convert(Request $request, EstimateRequest $estimateRequest): JsonResponse
    {
        $this->authorize('view', $estimateRequest);
        $user = $request->user();
        $data = $request->validate([
            'convert_to' => ['required', Rule::in(['estimate', 'proposal'])],
            'customer_id' => ['nullable', 'integer', Rule::exists('customers', 'id')->where('company_id', $user->company_id)],
            'company' => ['required_without:customer_id', 'nullable', 'string', 'max:191'],
            'first_name' => ['required_without:customer_id', 'nullable', 'string', 'max:191'],
            'last_name' => ['nullable', 'string', 'max:191'],
            'email' => ['required_without:customer_id', 'nullable', 'email', 'max:191'],
            'phone' => ['nullable', 'string', 'max:50'],
            'website' => ['nullable', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'zip' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
        ]);
        abort_unless($user->hasPermission($data['convert_to'] === 'estimate' ? 'estimates' : 'proposals', 'create'), 403);

        $customerId = $data['customer_id'] ?? null;
        if (! $customerId) {
            $this->authorize('create', Customer::class);
            $customerId = DB::transaction(function () use ($data, $user) {
                $customer = Customer::create([
                    'name' => $data['company'], 'email' => $data['email'], 'phone' => $data['phone'] ?? null, 'website' => $data['website'] ?? null,
                    'address' => $data['address'] ?? null, 'city' => $data['city'] ?? null, 'state' => $data['state'] ?? null,
                    'zip' => $data['zip'] ?? null, 'country' => $data['country'] ?? null,
                    'billing_street' => $data['address'] ?? null, 'billing_city' => $data['city'] ?? null, 'billing_state' => $data['state'] ?? null,
                    'billing_zip' => $data['zip'] ?? null, 'billing_country' => $data['country'] ?? null,
                    'created_by' => $user->id,
                ]);
                $customer->contacts()->create([
                    'first_name' => $data['first_name'], 'last_name' => $data['last_name'] ?? null, 'email' => $data['email'],
                    'phone' => $data['phone'] ?? null, 'is_primary' => true,
                ]);
                // Perfex: someone who can't see all customers becomes this customer's admin.
                if (! $user->hasPermission('customers', 'view')) {
                    CustomerAdmin::create(['customer_id' => $customer->id, 'user_id' => $user->id]);
                }

                return $customer->id;
            });
        }

        $path = $data['convert_to'] === 'estimate' ? '/estimates/new' : '/proposals/new';

        return response()->json(['data' => [
            'customer_id' => $customerId,
            'redirect' => "{$path}?customer_id={$customerId}&estimate_request_id={$estimateRequest->id}",
        ]]);
    }

    // Forms ------------------------------------------------------------------------------------

    public function forms(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(['data' => EstimateRequestForm::withCount('requests')->latest()->get()]);
    }

    public function storeForm(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $form = EstimateRequestForm::create([...$this->validateForm($request), 'form_key' => Str::random(32), 'created_by' => $request->user()->id]);

        return response()->json(['data' => $form], 201);
    }

    public function updateForm(Request $request, EstimateRequestForm $form): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $form->update($this->validateForm($request));

        return response()->json(['data' => $form]);
    }

    public function destroyForm(Request $request, EstimateRequestForm $form): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $form->delete();

        return response()->json(['message' => 'Form deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateForm(Request $request): array
    {
        $company = $request->user()->company_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'fields' => ['required', 'array', 'min:1', 'max:60'],
            'fields.*.type' => ['required', Rule::in(self::FIELD_TYPES)],
            'fields.*.name' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9_]+$/', 'distinct'],
            'fields.*.label' => ['required', 'string', 'max:191'],
            'fields.*.required' => ['boolean'],
            'fields.*.placeholder' => ['nullable', 'string', 'max:191'],
            'fields.*.options' => ['nullable', 'array', 'max:50'],
            'fields.*.options.*' => ['string', 'max:191'],
            'estimate_request_status_id' => ['nullable', 'integer', Rule::exists('estimate_request_statuses', 'id')->where('company_id', $company)],
            'responsible_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)],
            'submit_btn_name' => ['nullable', 'string', 'max:100'],
            'success_submit_msg' => ['nullable', 'string', 'max:5000'],
            'notify_request_submitted' => ['boolean'],
            'notify_type' => ['nullable', Rule::in(['specific_staff', 'roles', 'assigned'])],
            'notify_ids' => ['nullable', 'array'],
            'notify_ids.*' => ['integer'],
            'active' => ['boolean'],
            'recaptcha' => ['boolean'],
        ]);

        // Every request needs an e-mail: make sure the form has a required "email" field.
        if (! collect($data['fields'])->contains(fn ($f) => $f['name'] === 'email')) {
            array_unshift($data['fields'], ['type' => 'email', 'name' => 'email', 'label' => 'Email', 'required' => true]);
        }
        $data['fields'] = array_map(fn ($f) => $f['name'] === 'email' ? [...$f, 'type' => 'email', 'required' => true] : $f, $data['fields']);
        $data['submit_btn_name'] = ($data['submit_btn_name'] ?? null) ?: 'Submit';

        return $data;
    }

    // Presenters -------------------------------------------------------------------------------

    /**
     * @return array<string, mixed>
     */
    private function row(EstimateRequest $r, ?User $assigned): array
    {
        return [
            'id' => $r->id,
            'email' => $r->email,
            'form' => $r->form?->name,
            'status' => $r->status ? ['id' => $r->status->id, 'name' => $r->status->name, 'color' => $r->status->color] : null,
            'assigned' => $assigned ? ['id' => $assigned->id, 'full_name' => $assigned->full_name] : null,
            'tags' => $r->tags->pluck('name'),
            'created_at' => $r->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(EstimateRequest $r): array
    {
        $r->load(['status', 'form:id,name', 'tags', 'attachments.user', 'estimate', 'proposal']);
        $assigned = $r->assigned_id ? User::find($r->assigned_id, ['id', 'full_name']) : null;

        return [
            ...$this->row($r, $assigned),
            'submission' => $r->submission,
            'last_status_change_at' => $r->last_status_change_at?->toIso8601String(),
            'date_estimated' => $r->date_estimated?->toIso8601String(),
            'estimate' => $r->estimate ? ['id' => $r->estimate->id, 'number' => $r->estimate->formattedNumber()] : null,
            'proposal' => $r->proposal ? ['id' => $r->proposal->id, 'number' => $r->proposal->formattedNumber()] : null,
            'attachments' => AttachmentResource::collection($r->attachments)->resolve(),
            'prefill' => [
                'company' => $r->value('company'),
                'first_name' => $r->value('first_name') ?? $r->value('name'),
                'last_name' => $r->value('last_name'),
                'email' => $r->email,
                'phone' => $r->value('phone') ?? $r->value('phonenumber'),
                'website' => $r->value('website'),
                'address' => $r->value('address'),
                'city' => $r->value('city'),
                'state' => $r->value('state'),
                'zip' => $r->value('zip'),
                'country' => $r->value('country'),
            ],
        ];
    }
}
