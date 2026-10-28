<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KbArticle;
use App\Models\KbFeedback;
use App\Models\KbGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Perfex knowledge base: groups of articles, helpful / not helpful votes and views.
 */
class KnowledgeBaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->allow($request, 'view');
        $search = $request->string('search')->trim()->value();

        $groups = KbGroup::orderBy('group_order')->orderBy('name')
            ->with(['articles' => fn ($q) => $q
                ->when($search, fn ($q) => $q->where(fn ($q) => $q->where('subject', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%")))
                ->withCount(['feedback as helpful_count' => fn ($f) => $f->where('helpful', true), 'feedback as not_helpful_count' => fn ($f) => $f->where('helpful', false)])
                ->select(['id', 'kb_group_id', 'subject', 'slug', 'active', 'staff_article', 'article_order', 'views', 'created_at'])])
            ->get();

        return response()->json(['data' => $groups]);
    }

    public function show(Request $request, KbArticle $article): JsonResponse
    {
        $this->allow($request, 'view');
        $article->increment('views');

        return response()->json(['data' => [
            ...$article->load('group:id,name,color')->toArray(),
            'helpful_count' => $article->feedback()->where('helpful', true)->count(),
            'not_helpful_count' => $article->feedback()->where('helpful', false)->count(),
            'my_vote' => $article->feedback()->where('user_id', $request->user()->id)->value('helpful'),
            'related' => KbArticle::where('kb_group_id', $article->kb_group_id)->whereKeyNot($article->id)->where('active', true)->limit(5)->get(['id', 'subject']),
        ]]);
    }

    public function storeArticle(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $data = $this->validateArticle($request);

        return response()->json(['data' => KbArticle::create([...$data, 'slug' => Str::slug($data['subject']), 'created_by' => $request->user()->id])], 201);
    }

    public function updateArticle(Request $request, KbArticle $article): JsonResponse
    {
        $this->allow($request, 'edit');
        $data = $this->validateArticle($request);
        $article->update([...$data, 'slug' => Str::slug($data['subject'])]);

        return response()->json(['data' => $article]);
    }

    public function destroyArticle(Request $request, KbArticle $article): JsonResponse
    {
        $this->allow($request, 'delete');
        $article->delete();

        return response()->json(['message' => 'Article deleted.']);
    }

    /**
     * "Did you find this article useful?" — one vote per staff member, changeable.
     */
    public function vote(Request $request, KbArticle $article): JsonResponse
    {
        $this->allow($request, 'view');
        $data = $request->validate(['helpful' => ['required', 'boolean']]);
        KbFeedback::updateOrCreate(['kb_article_id' => $article->id, 'user_id' => $request->user()->id], ['helpful' => $data['helpful']]);

        return response()->json(['message' => 'Thanks for your feedback.']);
    }

    public function storeGroup(Request $request): JsonResponse
    {
        $this->allow($request, 'create');

        return response()->json(['data' => KbGroup::create($this->validateGroup($request))], 201);
    }

    public function updateGroup(Request $request, KbGroup $group): JsonResponse
    {
        $this->allow($request, 'edit');
        $group->update($this->validateGroup($request));

        return response()->json(['data' => $group]);
    }

    public function destroyGroup(Request $request, KbGroup $group): JsonResponse
    {
        $this->allow($request, 'delete');
        $group->delete();

        return response()->json(['message' => 'Group deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateArticle(Request $request): array
    {
        return $request->validate([
            'subject' => ['required', 'string', 'max:500'],
            'kb_group_id' => ['required', 'integer', Rule::exists('kb_groups', 'id')->where('company_id', $request->user()->company_id)],
            'description' => ['nullable', 'string', 'max:500000'],
            'active' => ['boolean'],
            'staff_article' => ['boolean'],
            'article_order' => ['nullable', 'integer', 'min:0'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateGroup(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:300'],
            'description' => ['nullable', 'string', 'max:5000'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'active' => ['boolean'],
            'group_order' => ['nullable', 'integer', 'min:0'],
        ]);
    }

    private function allow(Request $request, string $capability): void
    {
        // Every staff member can read the knowledge base, as in Perfex.
        abort_unless($capability === 'view' || $request->user()->hasPermission('knowledge_base', $capability), 403);
    }
}
