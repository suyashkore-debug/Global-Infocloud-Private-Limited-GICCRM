<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomField;
use App\Services\CustomFields;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Setup → Custom Fields (admins) and the values on records (people who can see / edit them).
 */
class CustomFieldController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(['data' => CustomField::withCount('values')->orderBy('field_to')->orderBy('field_order')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $this->validated($request);
        $data['slug'] = $data['field_to'].'_'.Str::slug($data['name'], '_');

        return response()->json(['data' => CustomField::create($data)], 201);
    }

    public function update(Request $request, CustomField $customField): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $this->validated($request);
        // Perfex: once a field has values, its module and type can't change.
        if ($customField->values()->exists()) {
            $data['field_to'] = $customField->field_to;
            $data['type'] = $customField->type;
        }
        $customField->update($data);

        return response()->json(['data' => $customField]);
    }

    public function destroy(Request $request, CustomField $customField): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $customField->delete();

        return response()->json(['message' => 'Custom field deleted.']);
    }

    /**
     * The active fields of a module, for its forms and tables.
     */
    public function definitions(Request $request, string $fieldTo): JsonResponse
    {
        abort_unless(isset(CustomFields::RECORD_TYPES[$fieldTo]), 404);

        return response()->json(['data' => CustomFields::definitions($fieldTo, $request->user())]);
    }

    /**
     * Values for one record (?id=) or several (?ids[]=), keyed by record id then field id.
     */
    public function values(Request $request, string $fieldTo): JsonResponse
    {
        $ids = array_map('intval', (array) $request->input('ids', $request->filled('id') ? [$request->integer('id')] : []));
        if ($request->filled('id')) {
            CustomFields::record($fieldTo, $request->integer('id'), $request->user(), false);
        } else {
            abort_unless(isset(CustomFields::RECORD_TYPES[$fieldTo]), 404);
            // Only records the user can find (company scope) are returned.
            $ids = CustomFields::RECORD_TYPES[$fieldTo]::whereIn('id', array_slice($ids, 0, 500))->pluck('id')->all();
        }

        return response()->json(['data' => (object) CustomFields::values($fieldTo, $ids, $request->user())]);
    }

    public function save(Request $request, string $fieldTo, int $id): JsonResponse
    {
        CustomFields::record($fieldTo, $id, $request->user(), true);
        $data = $request->validate(['custom_fields' => ['present', 'array']]);
        CustomFields::save($fieldTo, $id, $data['custom_fields'], $request->user());

        return response()->json(['data' => (object) (CustomFields::values($fieldTo, [$id], $request->user())[$id] ?? [])]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'field_to' => ['required', Rule::in(array_keys(CustomFields::RECORD_TYPES))],
            'name' => ['required', 'string', 'max:150'],
            'type' => ['required', Rule::in(CustomField::TYPES)],
            'options' => ['nullable', 'array', 'max:100'],
            'options.*' => ['string', 'max:191'],
            'default_value' => ['nullable', 'string', 'max:5000'],
            'required' => ['boolean'],
            'active' => ['boolean'],
            'only_admin' => ['boolean'],
            'show_on_table' => ['boolean'],
            'show_on_pdf' => ['boolean'],
            'field_order' => ['nullable', 'integer', 'min:0'],
            'bs_column' => ['nullable', 'integer', Rule::in([3, 4, 6, 12])],
        ]);
        if (in_array($data['type'], ['select', 'multiselect', 'checkbox'], true) && empty($data['options'])) {
            abort(response()->json(['message' => 'Add at least one option.', 'errors' => ['options' => ['Add at least one option.']]], 422));
        }
        $data['field_order'] ??= 0;
        $data['bs_column'] ??= 12;

        return $data;
    }
}
