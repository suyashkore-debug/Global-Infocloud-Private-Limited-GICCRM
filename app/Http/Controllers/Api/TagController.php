<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Setup → Tags (Perfex Settings → Tags): the company's tags, how often each is used, rename or
 * delete one everywhere at once.
 */
class TagController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $usage = DB::table('taggables')->selectRaw('tag_id, count(*) as total')->groupBy('tag_id')->pluck('total', 'tag_id');

        return response()->json(['data' => Tag::orderBy('name')->get()->map(fn (Tag $t) => ['id' => $t->id, 'name' => $t->name, 'used' => (int) ($usage[$t->id] ?? 0)])]);
    }

    public function update(Request $request, Tag $tag): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('tags', 'name')->where('company_id', $tag->company_id)->ignore($tag->id)]]);
        $tag->update($data);

        return response()->json(['data' => ['id' => $tag->id, 'name' => $tag->name]]);
    }

    public function destroy(Request $request, Tag $tag): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        DB::transaction(function () use ($tag) {
            DB::table('taggables')->where('tag_id', $tag->id)->delete();
            $tag->delete();
        });

        return response()->json(['message' => 'Tag deleted.']);
    }
}
