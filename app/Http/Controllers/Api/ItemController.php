<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Sales → Items. Everyone who can make sales documents can pick items; changing them needs the
 * items permissions.
 */
class ItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = Item::query()
            ->with(['group:id,name', 'tax:id,name,rate', 'tax2:id,name,rate'])
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($q) => $q
                ->where('description', 'like', "%{$s}%")
                ->orWhere('long_description', 'like', "%{$s}%")
                ->orWhere('hsn_code', 'like', "%{$s}%")))
            ->when($request->integer('group_id'), fn ($q, $id) => $q->where('item_group_id', $id))
            ->orderBy('description');

        if ($request->boolean('all')) {
            return response()->json(['data' => $items->get()]);
        }
        $page = $items->paginate($request->integer('per_page', 25));

        // Same page format as the other lists (the Items screen reads meta.current_page).
        return response()->json([
            'data' => $page->items(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('items', 'create'), 403);

        return response()->json(['data' => Item::create($this->validated($request))->load(['group', 'tax', 'tax2'])], 201);
    }

    public function update(Request $request, Item $item): JsonResponse
    {
        abort_unless($request->user()->hasPermission('items', 'edit'), 403);
        $item->update($this->validated($request));

        return response()->json(['data' => $item->load(['group', 'tax', 'tax2'])]);
    }

    public function destroy(Request $request, Item $item): JsonResponse
    {
        abort_unless($request->user()->hasPermission('items', 'delete'), 403);
        $item->delete();

        return response()->json(['message' => 'Item deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;

        return $request->validate([
            'description' => ['required', 'string', 'max:500'],
            'long_description' => ['nullable', 'string', 'max:5000'],
            'hsn_code' => ['nullable', 'string', 'max:50'],
            'rate' => ['required', 'numeric', 'min:0'],
            'unit' => ['nullable', 'string', 'max:40'],
            'item_group_id' => ['nullable', 'integer', Rule::exists('item_groups', 'id')->where('company_id', $company)],
            'tax_id' => ['nullable', 'integer', Rule::exists('taxes', 'id')->where('company_id', $company)],
            'tax2_id' => ['nullable', 'integer', Rule::exists('taxes', 'id')->where('company_id', $company)],
        ]);
    }
}
