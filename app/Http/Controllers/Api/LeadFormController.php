<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeadForm;
use App\Models\LeadPipeline;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Leads → Web to Lead (Perfex): admins build the public forms and copy their link / embed code.
 */
class LeadFormController extends Controller
{
    private const FIELD_TYPES = ['text', 'email', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $forms = LeadForm::withCount('leads')->latest()->get();

        // Only the forms of the workspace open in the header (a form on "Default" fills the default status's workspace).
        if ($workspace = LeadPipeline::current($request->user())) {
            DefaultLookups::ensureLeadLists();
            $statuses = LeadStatus::pluck('pipeline_id', 'id');
            $default = (int) Options::get('leads_default_status') ?: LeadStatus::orderBy('status_order')->value('id');
            $forms = $forms->filter(fn (LeadForm $f) => (int) ($statuses[$f->lead_status_id ?? $default] ?? 0) === $workspace->id)->values();
        }

        return response()->json(['data' => $forms]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $form = LeadForm::create([...$this->validated($request), 'form_key' => Str::random(32), 'created_by' => $request->user()->id]);

        return response()->json(['data' => $form], 201);
    }

    public function update(Request $request, LeadForm $leadForm): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $leadForm->update($this->validated($request));

        return response()->json(['data' => $leadForm]);
    }

    /** The list's Active switch: the form takes submissions or not. */
    public function toggle(Request $request, LeadForm $leadForm): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $leadForm->update(['active' => $request->validate(['active' => ['required', 'boolean']])['active']]);

        return response()->json(['data' => $leadForm->loadCount('leads')]);
    }

    public function destroy(Request $request, LeadForm $leadForm): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $leadForm->delete();

        return response()->json(['message' => 'Form deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
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
            'fields.*.options' => ['nullable', 'array', 'max:300'],
            'fields.*.options.*' => ['string', 'max:191'],
            'lead_status_id' => ['nullable', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company)],
            'lead_source_id' => ['nullable', 'integer', Rule::exists('lead_sources', 'id')->where('company_id', $company)],
            'responsible_id' => ['nullable', 'integer', Rule::exists('crm_users', 'id')->where('company_id', $company)->where('is_active', true)],
            // Staff who get the leads in turn (round-robin); empty: the responsible person gets them all.
            'assignee_ids' => ['nullable', 'array', 'max:50'],
            'assignee_ids.*' => ['integer', 'distinct', Rule::exists('crm_users', 'id')->where('company_id', $company)->where('is_active', true)],
            'lead_name_prefix' => ['nullable', 'string', 'max:100'],
            'language' => ['nullable', 'string', 'max:40'],
            'submit_btn_name' => ['required', 'string', 'max:100'],
            'submit_btn_bg_color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'submit_btn_text_color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'submit_action' => ['required', Rule::in(['message', 'redirect'])],
            'success_submit_msg' => ['nullable', 'string', 'max:5000'],
            'submit_redirect_url' => ['nullable', 'required_if:submit_action,redirect', 'url', 'max:500'],
            'mark_public' => ['boolean'],
            'allow_duplicate' => ['boolean'],
            'track_duplicate_field' => ['nullable', Rule::in(LeadForm::DUPLICATE_FIELDS)],
            'track_duplicate_field_and' => ['nullable', Rule::in(LeadForm::DUPLICATE_FIELDS)],
            'create_task_on_duplicate' => ['boolean'],
            'notify_lead_imported' => ['boolean'],
            'notify_type' => ['nullable', Rule::in(['specific_staff', 'roles', 'assigned'])],
            'notify_ids' => ['nullable', 'array'],
            'notify_ids.*' => ['integer', Rule::exists('crm_users', 'id')->where('company_id', $company)],
            'active' => ['boolean'],
            'recaptcha' => ['boolean'],
        ], [
            'fields.*.name.distinct' => 'Two fields fill the same place; give each field its own.',
            'submit_redirect_url.required_if' => 'Enter the website address to redirect to.',
        ]);

        // In turn among staff, or one responsible person: not both.
        if (! empty($data['assignee_ids'])) {
            $data['responsible_id'] = null;
        }
        $data['assignee_ids'] = array_values(array_map('intval', $data['assignee_ids'] ?? [])) ?: null;

        return $data;
    }
}
