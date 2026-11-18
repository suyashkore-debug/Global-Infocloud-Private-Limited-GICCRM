<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContractType;
use App\Models\Concerns\SharedAcrossWorkspaces;
use App\Models\Currency;
use App\Support\CountryProfile;
use App\Support\TaxNumber;
use App\Support\Workspace;
use App\Models\CustomerGroup;
use App\Models\EstimateRequestStatus;
use App\Models\ExpenseCategory;
use App\Models\ItemGroup;
use App\Models\LeadPipeline;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\PaymentMode;
use App\Models\PredefinedReply;
use App\Models\SupportDepartment;
use App\Models\Tax;
use App\Models\TicketPriority;
use App\Models\TicketService;
use App\Models\TicketStatus;
use App\Models\VendorCategory;
use App\Services\DefaultLookups;
use App\Services\Options;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Setup: company details / numbering options and the small lookup lists (Perfex Setup → Finance,
 * Customers → Groups, Items → Groups). Everyone can read the lists; only admins change them.
 */
class SetupController extends Controller
{
    /**
     * @var array<string, array{model: class-string<Model>, rules: array<string, mixed>, order: string}>
     */
    private const LISTS = [
        'currencies' => ['model' => Currency::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:100'],
            'symbol' => ['required', 'string', 'max:10'],
            'decimal_separator' => ['required', 'string', 'max:5'],
            'thousand_separator' => ['nullable', 'string', 'max:5'],
            'placement' => ['required', 'in:before,after'],
            'is_default' => ['boolean'],
        ]],
        'taxes' => ['model' => Tax::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:100'],
            'rate' => ['required', 'numeric', 'min:0', 'max:100'],
        ]],
        'payment-modes' => ['model' => PaymentMode::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:5000'],
            'show_on_pdf' => ['boolean'],
            'invoices_only' => ['boolean'],
            'expenses_only' => ['boolean'],
            'selected_by_default' => ['boolean'],
            'active' => ['boolean'],
        ]],
        'item-groups' => ['model' => ItemGroup::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:100'],
        ]],
        'customer-groups' => ['model' => CustomerGroup::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:255'],
        ]],
        'expense-categories' => ['model' => ExpenseCategory::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:300'],
            'description' => ['nullable', 'string', 'max:5000'],
        ]],
        'vendor-categories' => ['model' => VendorCategory::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
        ]],
        'contract-types' => ['model' => ContractType::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:255'],
        ]],
        'lead-statuses' => ['model' => LeadStatus::class, 'order' => 'status_order', 'rules' => [
            'name' => ['required', 'string', 'max:50'],
            'status_order' => ['nullable', 'integer', 'min:0'],
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'notify_lead' => ['boolean'],
            'pipeline_id' => ['nullable', 'integer'],
            'move_to_status_id' => ['nullable', 'integer'],
            'move_assign' => ['nullable', 'in:keep,team,user'],
            'move_assign_user_id' => ['nullable', 'integer'],
        ]],
        'lead-pipelines' => ['model' => LeadPipeline::class, 'order' => 'sort_order', 'rules' => [
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_default' => ['boolean'],
            'member_ids' => ['nullable', 'array'],
            'member_ids.*' => ['integer'],
        ]],
        'lead-sources' => ['model' => LeadSource::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:150'],
        ]],
        'ticket-statuses' => ['model' => TicketStatus::class, 'order' => 'status_order', 'rules' => [
            'name' => ['required', 'string', 'max:50'],
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'status_order' => ['nullable', 'integer', 'min:0'],
        ]],
        'estimate-request-statuses' => ['model' => EstimateRequestStatus::class, 'order' => 'status_order', 'rules' => [
            'name' => ['required', 'string', 'max:50'],
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'status_order' => ['nullable', 'integer', 'min:0'],
        ]],
        'ticket-priorities' => ['model' => TicketPriority::class, 'order' => 'id', 'rules' => [
            'name' => ['required', 'string', 'max:50'],
        ]],
        'ticket-services' => ['model' => TicketService::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:50'],
        ]],
        'predefined-replies' => ['model' => PredefinedReply::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:300'],
            'message' => ['required', 'string', 'max:65000'],
        ]],
        'support-departments' => ['model' => SupportDepartment::class, 'order' => 'name', 'rules' => [
            'name' => ['required', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:100'],
            'hide_from_client' => ['boolean'],
        ]],
    ];

    public function options(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(['data' => Options::all(), 'meta' => $this->settingsMeta()]);
    }

    /**
     * The workspace whose settings Setup shows (null: the default one's, which the others follow
     * for what they haven't changed) and which of them it changed.
     *
     * @return array<string, mixed>
     */
    private function settingsMeta(): array
    {
        $workspace = Options::workspaceId();

        return [
            'workspace' => $workspace ? LeadPipeline::whereKey($workspace)->first(['id', 'name']) : null,
            'default_workspace' => LeadPipeline::count() > 1 ? LeadPipeline::where('is_default', true)->first(['id', 'name']) : null,
            'own' => Options::ownNames(),
            'common' => Options::COMMON,
        ];
    }

    /**
     * The settings that shape everyday screens (defaults, visible fields), for every staff member.
     */
    public function appOptions(): JsonResponse
    {
        // The company's default currency formats amounts that carry none of their own.
        $currency = Currency::where('is_default', true)->first(['name', 'symbol', 'placement']);

        return response()->json(['data' => [
            ...collect(Options::PUBLIC)->mapWithKeys(fn ($name) => [$name => Options::get($name)])->all(),
            'currency' => $currency?->only(['name', 'symbol', 'placement']),
        ]]);
    }

    /** Setup → reCAPTCHA: the site key, and whether a secret key is saved (never the key itself). */
    public function recaptcha(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $company = (int) $request->user()->company_id;

        return response()->json(['data' => [
            'site_key' => Options::get('recaptcha_site_key', $company),
            'has_secret_key' => Options::secret('recaptcha_secret_key', $company) !== '',
        ]]);
    }

    public function saveRecaptcha(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $company = (int) $request->user()->company_id;
        $data = $request->validate([
            'site_key' => ['nullable', 'string', 'max:200'],
            'secret_key' => ['nullable', 'string', 'max:200'],
            'clear' => ['boolean'],
        ]);

        if ($data['clear'] ?? false) {
            Options::set('recaptcha_site_key', '', $company);
            Options::setSecret('recaptcha_secret_key', '', $company);
        } else {
            Options::set('recaptcha_site_key', trim((string) ($data['site_key'] ?? '')), $company);
            if (! empty($data['secret_key'])) {
                Options::setSecret('recaptcha_secret_key', trim($data['secret_key']), $company);
            }
        }

        return $this->recaptcha($request);
    }

    public function saveOptions(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $data = $request->validate([
            'options' => ['required', 'array'],
            'options.*' => ['nullable', 'string', 'max:65000'],
        ]);

        $oldCountry = Options::get('company_country');
        // The company's tax number in its (new) country's format; PAN is India's and must match the GSTIN.
        if (array_key_exists('company_vat', $data['options']) || array_key_exists('company_pan', $data['options'])) {
            $country = (string) ($data['options']['company_country'] ?? $oldCountry ?: 'India');
            $vat = TaxNumber::normalize($data['options']['company_vat'] ?? Options::get('company_vat'));
            $pan = TaxNumber::hasPan($country) ? TaxNumber::normalize($data['options']['company_pan'] ?? Options::get('company_pan')) : null;
            $pan ??= TaxNumber::hasPan($country) ? TaxNumber::panFromGstin($vat) : null;
            // Numbers saved before these checks stay as they are until they or the country change.
            $same = $country === ($oldCountry ?: 'India');
            validator(['company_vat' => $vat, 'company_pan' => $pan], [
                'company_vat' => ['nullable', 'string', 'max:50', ...($same && $vat === TaxNumber::normalize(Options::get('company_vat')) ? [] : [TaxNumber::rule($country)])],
                'company_pan' => ['nullable', 'string', ...($same && $pan === TaxNumber::normalize(Options::get('company_pan')) ? [] : [TaxNumber::panRule($country, $vat)])],
            ])->validate();
            $data['options']['company_vat'] = (string) $vat;
            $data['options']['company_pan'] = (string) $pan;
        }
        // Two workspaces numbering with one prefix would give the same number twice.
        foreach (Options::COUNTERS as $prefix) {
            $value = $data['options'][$prefix] ?? null;
            if ($value !== null && ($taken = Options::prefixTakenBy($prefix, (string) $value))) {
                $name = LeadPipeline::whereKey($taken)->value('name');
                throw ValidationException::withMessages(["options.{$prefix}" => "The {$name} workspace already numbers with “{$value}”. Use another prefix so numbers don’t repeat."]);
            }
        }
        foreach ($data['options'] as $name => $value) {
            // The menus are saved checked, through Menu Setup.
            if (array_key_exists($name, Options::DEFAULTS) && ! in_array($name, ['recaptcha_secret_key', 'menu_setup', 'setup_menu_setup'], true)) {
                Options::set($name, $value);
            }
        }
        // A new country: its number format, and its tax number name unless that was changed too.
        $country = (string) ($data['options']['company_country'] ?? '');
        if ($country !== '' && $country !== $oldCountry) {
            $profile = CountryProfile::for($country);
            Options::set('locale', $profile['locale']);
            if (! array_key_exists('tax_id_label', $data['options']) || $data['options']['tax_id_label'] === Options::DEFAULTS['tax_id_label']) {
                Options::set('tax_id_label', $profile['tax_label']);
            }
        }

        return response()->json(['message' => 'Settings saved.', 'data' => Options::all(), 'meta' => $this->settingsMeta()]);
    }

    public function index(Request $request, string $list): JsonResponse
    {
        $config = $this->config($list);

        match ($list) {
            'currencies' => Currency::default(),
            'lead-statuses', 'lead-sources', 'lead-pipelines' => DefaultLookups::ensureLeadLists(),
            'ticket-statuses', 'ticket-priorities' => DefaultLookups::ensureTicketLists(),
            'estimate-request-statuses' => DefaultLookups::ensureEstimateRequestStatuses(),
            default => null,
        };

        $shared = in_array(SharedAcrossWorkspaces::class, class_uses_recursive($config['model']), true);
        $rows = $config['model']::query()->when($shared, fn ($q) => $q->forWorkspace())->orderBy($config['order'])->get();
        if ($list === 'support-departments') {
            $rows->each(fn (SupportDepartment $d) => $d->setAttribute('member_ids', $d->memberIds()));
        }
        if ($list === 'lead-statuses') {
            // Grouped by pipeline (in the pipelines' order), with the pipeline's name.
            $pipelines = LeadPipeline::orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'sort_order'])->values();
            $rank = $pipelines->mapWithKeys(fn ($p, $i) => [$p->id => $i]);
            $rows = $rows->sortBy(fn (LeadStatus $s) => [$rank[$s->pipeline_id] ?? 999, $s->status_order, $s->id])->values();
            $rows->each(fn (LeadStatus $s) => $s->setAttribute('pipeline_name', $pipelines->firstWhere('id', $s->pipeline_id)?->name));
        }
        if ($list === 'lead-pipelines') {
            $counts = LeadStatus::selectRaw('pipeline_id, count(*) as n')->groupBy('pipeline_id')->pluck('n', 'pipeline_id');
            $rows->each(fn (LeadPipeline $p) => $p->setAttribute('statuses_count', (int) ($counts[$p->id] ?? 0)));
        }

        // The lead workspace open in the header: new leads, forms and imports start in it.
        $meta = $list === 'lead-statuses' ? ['workspace_id' => LeadPipeline::current($request->user())?->id, 'workspace_ids' => LeadPipeline::listFor($request->user())->pluck('id')] : [];
        // Lists whose items are for one workspace or all: the workspaces to pick from.
        if ($shared && LeadPipeline::count() > 1) {
            $meta = ['workspace_id' => Workspace::filterId(), 'workspaces' => LeadPipeline::orderBy('sort_order')->orderBy('id')->get(['id', 'name'])];
        }

        return response()->json(['data' => $rows, ...($meta ? ['meta' => $meta] : [])]);
    }

    public function store(Request $request, string $list): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $config = $this->config($list);

        $record = $config['model']::create($this->validated($request, $list, $config, null));
        $this->keepSingleDefault($list, $record);
        $this->syncDepartmentMembers($request, $list, $record);

        return response()->json(['data' => $record], 201);
    }

    public function update(Request $request, string $list, int $id): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $config = $this->config($list);

        $record = $config['model']::findOrFail($id);
        $record->update($this->validated($request, $list, $config, $record));
        $this->keepSingleDefault($list, $record);
        $this->syncDepartmentMembers($request, $list, $record);

        return response()->json(['data' => $record]);
    }

    public function destroy(Request $request, string $list, int $id): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $config = $this->config($list);

        $record = $config['model']::findOrFail($id);
        if ($list === 'currencies' && $record->is_default) {
            return response()->json(['message' => 'The base currency cannot be deleted.'], 422);
        }
        if ($list === 'ticket-statuses' && $record->system_key) {
            return response()->json(['message' => 'Built-in ticket statuses cannot be deleted.'], 422);
        }
        if ($list === 'estimate-request-statuses' && $record->flag) {
            return response()->json(['message' => 'Built-in request statuses cannot be deleted.'], 422);
        }
        if ($list === 'lead-statuses' && $record->is_default) {
            return response()->json(['message' => 'The status converted leads get cannot be deleted.'], 422);
        }
        if ($list === 'lead-statuses') {
            LeadStatus::where('move_to_status_id', $record->id)->update(['move_to_status_id' => null]);
        }
        if ($list === 'lead-pipelines' && $record->is_default) {
            return response()->json(['message' => 'The default workspace cannot be deleted.'], 422);
        }
        if ($list === 'lead-pipelines' && LeadStatus::where('pipeline_id', $record->id)->exists()) {
            return response()->json(['message' => 'Move or delete this workspace’s statuses first.'], 422);
        }
        $record->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    /**
     * @return array{model: class-string<Model>, rules: array<string, mixed>, order: string}
     */
    private function config(string $list): array
    {
        abort_unless(isset(self::LISTS[$list]), 404);

        return self::LISTS[$list];
    }

    private function syncDepartmentMembers(Request $request, string $list, Model $record): void
    {
        if ($list === 'support-departments' && $request->has('member_ids')) {
            $ids = $request->validate([
                'member_ids' => ['array'],
                'member_ids.*' => ['integer', Rule::exists('crm_users', 'id')->where('company_id', $request->user()->company_id)],
            ])['member_ids'] ?? [];
            $record->syncMembers($ids);
        }
    }

    private function keepSingleDefault(string $list, Model $record): void
    {
        if ($list === 'currencies' && $record->is_default) {
            Currency::whereKeyNot($record->id)->update(['is_default' => false]);
        }
        if ($list === 'lead-pipelines' && $record->is_default) {
            LeadPipeline::whereKeyNot($record->id)->update(['is_default' => false]);
        }
    }

    /**
     * The list's rules, plus checks against the company's own records (pipelines, statuses, staff).
     *
     * @param  array{rules: array<string, mixed>}  $config
     * @return array<string, mixed>
     */
    private function validated(Request $request, string $list, array $config, ?Model $record): array
    {
        $company = $request->user()->company_id;
        $staff = Rule::exists('crm_users', 'id')->where('company_id', $company);
        $extra = match ($list) {
            'lead-statuses' => [
                'pipeline_id' => ['nullable', 'integer', Rule::exists('lead_pipelines', 'id')->where('company_id', $company)],
                'move_to_status_id' => ['nullable', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company), ...($record ? [Rule::notIn([$record->id])] : [])],
                'move_assign_user_id' => ['nullable', 'integer', $staff, 'required_if:move_assign,user'],
            ],
            'lead-pipelines' => ['member_ids.*' => ['integer', $staff]],
            default => [],
        };
        $data = $request->validate([...$config['rules'], ...$extra], [
            'move_to_status_id.not_in' => 'A status cannot move leads to itself.',
            'move_assign_user_id.required_if' => 'Choose who gets the moved leads.',
        ]);

        if ($list === 'lead-statuses') {
            // Only what was sent changes (e.g. older screens without the move settings).
            if (array_key_exists('move_to_status_id', $data) && empty($data['move_to_status_id'])) {
                $data['move_to_status_id'] = null;
            }
            if (array_key_exists('move_assign', $data)) {
                $data['move_assign'] ??= 'keep';
                if ($data['move_assign'] !== 'user') {
                    $data['move_assign_user_id'] = null;
                }
            }
            if (array_key_exists('pipeline_id', $data) && ! $data['pipeline_id']) {
                unset($data['pipeline_id']);
            }
        }
        if ($list === 'lead-pipelines') {
            $data['member_ids'] = array_values(array_unique(array_map('intval', $data['member_ids'] ?? [])));
        }
        if (in_array(SharedAcrossWorkspaces::class, class_uses_recursive($config['model']), true)) {
            $data = [...$data, ...$this->itemWorkspace($request, $list, $record, $data)];
        }

        return $data;
    }

    /**
     * Which workspace a list item is for: the one picked (empty: all workspaces); a new item
     * without a choice is for the workspace open in the header. Built-in items and the base
     * currency are always for all.
     *
     * @param  array<string, mixed>  $data
     * @return array{workspace_id?: int|null}
     */
    private function itemWorkspace(Request $request, string $list, ?Model $record, array $data): array
    {
        $builtIn = ($list === 'ticket-statuses' && $record?->system_key) || ($list === 'estimate-request-statuses' && $record?->flag)
            || ($list === 'currencies' && ($data['is_default'] ?? $record?->is_default));
        if ($builtIn) {
            return ['workspace_id' => null];
        }
        if ($request->exists('workspace_id')) {
            $id = $request->validate(['workspace_id' => ['nullable', 'integer', Rule::exists('lead_pipelines', 'id')->where('company_id', $request->user()->company_id)]])['workspace_id'] ?? null;

            return ['workspace_id' => $id ? (int) $id : null];
        }

        return $record ? [] : ['workspace_id' => Workspace::filterId() ?: null];
    }
}
