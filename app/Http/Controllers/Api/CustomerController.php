<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Customer::class);

        $customers = Customer::query()
            ->withCount('projects')
            ->with(['primaryContact', 'groups'])
            ->when($request->integer('group_id'), fn ($q, $id) => $q->whereHas('groups', fn ($g) => $g->where('customer_groups.id', $id)))
            ->when($request->string('search')->trim()->value(), fn ($q, $search) => $q->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('contact_name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 25));

        return CustomerResource::collection($customers);
    }

    /**
     * Active customers as select options, for anyone who may create or edit a project.
     */
    public function options(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('projects', 'create') || $request->user()->hasPermission('projects', 'edit') || $request->user()->hasPermission('customers', 'view'), 403);

        return response()->json([
            'data' => Customer::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(CustomerRequest $request): CustomerResource
    {
        $this->authorize('create', Customer::class);

        $data = $request->validated();
        $customer = DB::transaction(function () use ($data, $request) {
            $customer = Customer::create([...$data, 'created_by' => $request->user()->id]);
            $this->syncRelations($customer, $data);
            if (! empty($data['contact']['email'])) {
                $customer->contacts()->create([...$data['contact'], 'is_primary' => true]);
            }

            return $customer;
        });

        return new CustomerResource($this->loadForView($customer));
    }

    public function show(Customer $customer): CustomerResource
    {
        $this->authorize('view', $customer);

        return new CustomerResource($this->loadForView($customer));
    }

    public function update(CustomerRequest $request, Customer $customer): CustomerResource
    {
        $this->authorize('update', $customer);
        $data = $request->validated();
        DB::transaction(function () use ($customer, $data) {
            $customer->update($data);
            $this->syncRelations($customer, $data);
        });

        return new CustomerResource($this->loadForView($customer));
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $this->authorize('delete', $customer);

        if ($customer->projects()->exists() || $customer->invoices()->exists()) {
            return response()->json(['message' => 'This customer has projects or invoices. Delete or move them first.'], 422);
        }

        $customer->delete();

        return response()->json(['message' => 'Customer deleted.']);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function syncRelations(Customer $customer, array $data): void
    {
        if (array_key_exists('groups', $data)) {
            $customer->groups()->sync($data['groups'] ?? []);
        }
        if (array_key_exists('admins', $data)) {
            $customer->admins()->delete();
            foreach (array_unique($data['admins'] ?? []) as $userId) {
                $customer->admins()->create(['user_id' => $userId]);
            }
        }
    }

    private function loadForView(Customer $customer): Customer
    {
        return $customer->load(['contacts', 'primaryContact', 'groups', 'admins.user'])->loadCount('projects');
    }
}
