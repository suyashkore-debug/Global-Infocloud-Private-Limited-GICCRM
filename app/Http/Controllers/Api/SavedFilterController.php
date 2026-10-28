<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SavedFilter;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Saved list filters: mine and the shared ones, with my default per list. The author or an
 * admin changes a filter; anyone may pick any visible filter as their own default.
 */
class SavedFilterController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();
        $identifier = $request->validate(['identifier' => ['required', Rule::in(SavedFilter::IDENTIFIERS)]])['identifier'];
        $default = $this->defaultId($me, $identifier);
        $filters = SavedFilter::where('identifier', $identifier)->visibleTo($me)->orderBy('name')->get();
        $authors = User::whereIn('id', $filters->pluck('user_id')->unique())->pluck('full_name', 'id');

        return response()->json(['data' => $filters->map(fn (SavedFilter $f) => $this->present($f, $me, $default, $authors[$f->user_id] ?? null))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $this->validated($request, true);
        $filter = SavedFilter::create([...collect($data)->except('is_default')->all(), 'user_id' => $me->id]);
        $this->setDefault($me, $filter, (bool) ($data['is_default'] ?? false));

        return response()->json(['data' => $this->present($filter, $me, $this->defaultId($me, $filter->identifier), $me->full_name)], 201);
    }

    public function update(Request $request, SavedFilter $savedFilter): JsonResponse
    {
        $me = $request->user();
        $data = $this->validated($request, false);
        $own = collect($data)->only(['name', 'filters', 'is_shared'])->all();
        if ($own !== []) {
            abort_unless($savedFilter->canManage($me), 403);
            $savedFilter->update($own);
        }
        if (array_key_exists('is_default', $data)) {
            abort_unless($savedFilter->is_shared || $savedFilter->user_id === $me->id, 403);
            $this->setDefault($me, $savedFilter, (bool) $data['is_default']);
        }

        return response()->json(['data' => $this->present($savedFilter, $me, $this->defaultId($me, $savedFilter->identifier), null)]);
    }

    public function destroy(Request $request, SavedFilter $savedFilter): JsonResponse
    {
        abort_unless($savedFilter->canManage($request->user()), 403);
        $savedFilter->delete();

        return response()->json(['message' => 'Filter deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $creating): array
    {
        return $request->validate([
            'identifier' => [$creating ? 'required' : 'prohibited', Rule::in(SavedFilter::IDENTIFIERS)],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:191'],
            'filters' => [$creating ? 'required' : 'sometimes', 'array'],
            'is_shared' => ['sometimes', 'boolean'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
    }

    private function setDefault(User $me, SavedFilter $filter, bool $on): void
    {
        DB::table('saved_filter_defaults')->where('user_id', $me->id)->where('identifier', $filter->identifier)
            ->when(! $on, fn ($q) => $q->where('saved_filter_id', $filter->id))->delete();
        if ($on) {
            DB::table('saved_filter_defaults')->insert(['user_id' => $me->id, 'identifier' => $filter->identifier, 'saved_filter_id' => $filter->id, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    private function defaultId(User $me, string $identifier): ?int
    {
        $id = DB::table('saved_filter_defaults')->where('user_id', $me->id)->where('identifier', $identifier)->value('saved_filter_id');

        return $id ? (int) $id : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(SavedFilter $f, User $me, ?int $defaultId, ?string $author): array
    {
        return [
            'id' => $f->id,
            'name' => $f->name,
            'filters' => $f->filters,
            'is_shared' => $f->is_shared,
            'is_own' => (int) $f->user_id === (int) $me->id,
            'is_default' => $defaultId === $f->id,
            'can_manage' => $f->canManage($me),
            'author' => $author,
        ];
    }
}
