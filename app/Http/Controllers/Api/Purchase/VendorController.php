<?php

namespace App\Http\Controllers\Api\Purchase;

use App\Http\Controllers\Controller;
use App\Models\Vendor;
use App\Models\VendorCategory;
use App\Models\VendorContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Perfex purchase → Vendors: list with balance, add / edit with contacts, delete.
 */
class VendorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->allow($request, 'view');
        $page = Vendor::query()
            ->with('primaryContact')
            ->withSum(['invoices as invoiced' => fn ($q) => $q], 'total')
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('vendor_code', 'like', "%{$s}%")->orWhere('phone', 'like', "%{$s}%")->orWhere('vat', 'like', "%{$s}%")))
            ->when($request->integer('category_id'), fn ($q, $c) => $q->whereJsonContains('category_ids', $c))
            ->when($request->filled('active'), fn ($q) => $q->where('active', $request->boolean('active')))
            ->orderBy('name')->paginate($request->integer('per_page', 25));
        $categories = VendorCategory::pluck('name', 'id');

        return response()->json([
            'data' => collect($page->items())->map(fn (Vendor $v) => [
                'id' => $v->id, 'vendor_code' => $v->vendor_code, 'name' => $v->name, 'phone' => $v->phone, 'vat' => $v->vat, 'active' => $v->active,
                'primary_contact' => $v->primaryContact ? ['name' => trim($v->primaryContact->first_name.' '.$v->primaryContact->last_name), 'email' => $v->primaryContact->email] : null,
                'categories' => collect($v->category_ids ?? [])->map(fn ($id) => $categories[$id] ?? null)->filter()->values(),
                'invoiced' => round((float) $v->invoiced, 2),
                'created_at' => $v->created_at?->toIso8601String(),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    /**
     * id + name of active vendors, for selects.
     */
    public function options(Request $request): JsonResponse
    {
        return response()->json(['data' => Vendor::where('active', true)->orderBy('name')->get(['id', 'name', 'currency_id'])]);
    }

    public function show(Request $request, Vendor $vendor): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => $this->detail($vendor)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $data = $this->validated($request);
        $vendor = DB::transaction(function () use ($data, $request) {
            $vendor = Vendor::create([...collect($data)->except('contact')->all(), 'created_by' => $request->user()->id]);
            if (! empty($data['contact']['first_name'])) {
                $vendor->contacts()->create([...$data['contact'], 'is_primary' => true]);
            }

            return $vendor;
        });

        return response()->json(['data' => $this->detail($vendor)], 201);
    }

    public function update(Request $request, Vendor $vendor): JsonResponse
    {
        $this->allow($request, 'edit');
        $vendor->update(collect($this->validated($request))->except('contact')->all());

        return response()->json(['data' => $this->detail($vendor)]);
    }

    public function destroy(Request $request, Vendor $vendor): JsonResponse
    {
        $this->allow($request, 'delete');
        if ($vendor->invoices()->exists() || $vendor->orders()->exists()) {
            return response()->json(['message' => 'This vendor has purchase orders or invoices; mark it inactive instead.'], 422);
        }
        $vendor->delete();

        return response()->json(['message' => 'Vendor deleted.']);
    }

    public function saveContact(Request $request, Vendor $vendor, ?VendorContact $vendorContact = null): JsonResponse
    {
        $this->allow($request, 'edit');
        $contact = $vendorContact;
        abort_if($contact && $contact->vendor_id !== $vendor->id, 404);
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:191'],
            'last_name' => ['nullable', 'string', 'max:191'],
            'email' => ['nullable', 'email', 'max:191'],
            'phone' => ['nullable', 'string', 'max:100'],
            'title' => ['nullable', 'string', 'max:100'],
            'is_primary' => ['boolean'],
            'active' => ['boolean'],
        ]);
        DB::transaction(function () use ($vendor, $contact, $data) {
            if (! empty($data['is_primary']) || ! $vendor->contacts()->exists()) {
                $vendor->contacts()->update(['is_primary' => false]);
                $data['is_primary'] = true;
            }
            $contact ? $contact->update($data) : $vendor->contacts()->create($data);
        });

        return response()->json(['data' => $this->detail($vendor)]);
    }

    public function deleteContact(Request $request, Vendor $vendor, VendorContact $vendorContact): JsonResponse
    {
        $this->allow($request, 'edit');
        abort_if($vendorContact->vendor_id !== $vendor->id, 404);
        $vendorContact->delete();

        return response()->json(['data' => $this->detail($vendor)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;
        $text = fn (int $max) => ['nullable', 'string', 'max:'.$max];

        return $request->validate([
            'vendor_code' => [...$text(100), Rule::unique('vendors', 'vendor_code')->where('company_id', $company)->ignore($request->route('vendor'))],
            'name' => ['required', 'string', 'max:200'],
            'vat' => $text(200), 'phone' => $text(30), 'email' => ['nullable', 'email', 'max:191'], 'website' => $text(150),
            'address' => $text(1000), 'city' => $text(100), 'state' => $text(100), 'zip' => $text(20), 'country' => $text(100),
            'billing_street' => $text(200), 'billing_city' => $text(100), 'billing_state' => $text(100), 'billing_zip' => $text(20), 'billing_country' => $text(100),
            'shipping_street' => $text(200), 'shipping_city' => $text(100), 'shipping_state' => $text(100), 'shipping_zip' => $text(20), 'shipping_country' => $text(100),
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer', Rule::exists('vendor_categories', 'id')->where('company_id', $company)],
            'bank_detail' => $text(5000), 'payment_terms' => $text(5000),
            'currency_id' => ['nullable', 'integer', Rule::exists('currencies', 'id')->where('company_id', $company)],
            'balance' => ['nullable', 'numeric'], 'balance_as_of' => ['nullable', 'date'],
            'active' => ['boolean'],
            'contact' => ['nullable', 'array'],
            'contact.first_name' => $text(191), 'contact.last_name' => $text(191), 'contact.email' => ['nullable', 'email', 'max:191'],
            'contact.phone' => $text(100), 'contact.title' => $text(100),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(Vendor $vendor): array
    {
        $vendor->load(['contacts', 'currency']);
        $invoices = $vendor->invoices()->with('payments')->get();

        return [
            ...$vendor->toArray(),
            'totals' => [
                'invoiced' => round((float) $invoices->sum('total'), 2),
                'paid' => round((float) $invoices->sum(fn ($i) => $i->payments->sum('amount')), 2),
                'orders' => $vendor->orders()->count(),
                'invoices' => $invoices->count(),
            ],
        ];
    }

    private function allow(Request $request, string $capability): void
    {
        abort_unless($request->user()->hasPermission('purchase_vendors', $capability), 403);
    }
}
