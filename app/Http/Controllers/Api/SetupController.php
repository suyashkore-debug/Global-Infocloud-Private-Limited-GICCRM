<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContractType;
use App\Models\Currency;
use App\Models\CustomerGroup;
use App\Models\EstimateRequestStatus;
use App\Models\ExpenseCategory;
use App\Models\ItemGroup;
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

        return response()->json(['data' => Options::all()]);
    }

    /**
     * The settings that shape everyday screens (defaults, visible fields), for every staff member.
     */
    public function appOptions(): JsonResponse
    {
        return response()->json(['data' => collect(Options::PUBLIC)->mapWithKeys(fn ($name) => [$name => Options::get($name)])]);
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

        foreach ($data['options'] as $name => $value) {
            if (array_key_exists($name, Options::DEFAULTS) && $name !== 'recaptcha_secret_key') {
                Options::set($name, $value);
            }
        }

        return response()->json(['message' => 'Settings saved.', 'data' => Options::all()]);
    }

    public function index(string $list): JsonResponse
    {
        $config = $this->config($list);

        match ($list) {
            'currencies' => Currency::default(),
            'lead-statuses', 'lead-sources' => DefaultLookups::ensureLeadLists(),
            'ticket-statuses', 'ticket-priorities' => DefaultLookups::ensureTicketLists(),
            'estimate-request-statuses' => DefaultLookups::ensureEstimateRequestStatuses(),
            default => null,
        };

        $rows = $config['model']::orderBy($config['order'])->get();
        if ($list === 'support-departments') {
            $rows->each(fn (SupportDepartment $d) => $d->setAttribute('member_ids', $d->memberIds()));
        }

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, string $list): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $config = $this->config($list);

        $record = $config['model']::create($request->validate($config['rules']));
        $this->keepSingleDefault($list, $record);
        $this->syncDepartmentMembers($request, $list, $record);

        return response()->json(['data' => $record], 201);
    }

    public function update(Request $request, string $list, int $id): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $config = $this->config($list);

        $record = $config['model']::findOrFail($id);
        $record->update($request->validate($config['rules']));
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
                'member_ids.*' => ['integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)],
            ])['member_ids'] ?? [];
            $record->syncMembers($ids);
        }
    }

    private function keepSingleDefault(string $list, Model $record): void
    {
        if ($list === 'currencies' && $record->is_default) {
            Currency::whereKeyNot($record->id)->update(['is_default' => false]);
        }
    }
}
