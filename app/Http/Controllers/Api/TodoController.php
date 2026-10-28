<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Todo;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Perfex "To Do" items. Every item belongs to the signed-in staff member only.
 */
class TodoController extends Controller
{
    private const PER_PAGE = 20;

    public function index(Request $request): JsonResponse
    {
        $finished = $request->boolean('finished');
        $limit = self::PER_PAGE * max(1, $request->integer('page', 1));
        $query = $this->mine($request)->where('finished', $finished);

        return response()->json([
            'data' => (clone $query)->orderBy('item_order')->orderByDesc('id')->limit($limit)->get()->map(fn (Todo $t) => $this->present($t)),
            'meta' => ['total' => (clone $query)->count(), 'unfinished' => $this->mine($request)->where('finished', false)->count()],
        ]);
    }

    /**
     * Just the unfinished count, for the header badge.
     */
    public function count(Request $request): JsonResponse
    {
        return response()->json(['data' => ['unfinished' => $this->mine($request)->where('finished', false)->count()]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['description' => ['required', 'string', 'max:5000']]);
        $todo = Todo::create([
            'user_id' => $request->user()->id,
            'description' => $data['description'],
            'item_order' => (int) $this->mine($request)->where('finished', false)->max('item_order') + 1,
        ]);

        return response()->json(['data' => $this->present($todo)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $todo = $this->mine($request)->findOrFail($id);
        $data = $request->validate([
            'description' => ['sometimes', 'string', 'max:5000'],
            'finished' => ['sometimes', 'boolean'],
        ]);
        if (array_key_exists('finished', $data) && $data['finished'] !== $todo->finished) {
            $data['finished_at'] = $data['finished'] ? now() : null;
        }
        $todo->update($data);

        return response()->json(['data' => $this->present($todo)]);
    }

    /**
     * Drag & drop: the new order of a list, which may move items between unfinished and finished.
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'finished' => ['required', 'boolean'],
            'order' => ['required', 'array', 'max:500'],
            'order.*' => ['integer'],
        ]);

        DB::transaction(function () use ($request, $data) {
            $todos = $this->mine($request)->whereIn('id', $data['order'])->get()->keyBy('id');
            foreach ($data['order'] as $position => $id) {
                if (! $todo = $todos->get($id)) {
                    continue;
                }
                $todo->item_order = $position + 1;
                if ($todo->finished !== $data['finished']) {
                    $todo->finished = $data['finished'];
                    $todo->finished_at = $data['finished'] ? now() : null;
                }
                $todo->save();
            }
        });

        return response()->json(['message' => 'Order saved.']);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->mine($request)->findOrFail($id)->delete();

        return response()->json(['message' => 'Todo deleted.']);
    }

    /**
     * @return Builder<Todo>
     */
    private function mine(Request $request): Builder
    {
        return Todo::where('user_id', $request->user()->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Todo $todo): array
    {
        return [
            'id' => $todo->id,
            'description' => $todo->description,
            'finished' => $todo->finished,
            'finished_at' => $todo->finished_at?->toIso8601String(),
            'item_order' => $todo->item_order,
            'created_at' => $todo->created_at?->toIso8601String(),
        ];
    }
}
