<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\NewsfeedComment;
use App\Models\NewsfeedPost;
use App\Models\SupportDepartment;
use App\Models\User;
use App\Services\Notifier;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Perfex newsfeed: posts (pinned first), comments and likes, with notifications to the people
 * involved.
 */
class NewsfeedController extends Controller
{
    private const PER_PAGE = 10;

    public function __construct(private Notifier $notifier) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $page = max(1, $request->integer('page', 1));
        $visible = NewsfeedPost::query()->visibleTo($user);

        if ($postId = $request->integer('post')) {
            $posts = (clone $visible)->whereKey($postId)->get();
            $hasMore = false;
        } else {
            $regular = (clone $visible)->where('pinned', false)->latest()->skip(($page - 1) * self::PER_PAGE)->take(self::PER_PAGE + 1)->get();
            $hasMore = $regular->count() > self::PER_PAGE;
            $pinned = $page === 1 ? (clone $visible)->where('pinned', true)->orderBy('pinned_at')->get() : collect();
            $posts = $pinned->concat($regular->take(self::PER_PAGE));
        }

        return response()->json(['data' => $this->present($posts, $user), 'meta' => ['has_more' => $hasMore, 'page' => $page]]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'content' => ['required_without:files', 'nullable', 'string', 'max:20000'],
            'visibility' => ['nullable', 'array'],
            'visibility.*' => ['integer', Rule::exists('support_departments', 'id')->where('company_id', $user->company_id)],
            'files' => ['nullable', 'array', 'max:10'],
            'files.*' => ['file', 'max:20480'],
        ]);
        $visibility = empty($data['visibility']) ? null : array_values(array_unique(array_map('intval', $data['visibility'])));

        $post = DB::transaction(function () use ($request, $user, $data, $visibility) {
            $post = NewsfeedPost::create(['user_id' => $user->id, 'content' => $data['content'] ?? '', 'visibility' => $visibility]);
            foreach ($request->file('files', []) as $file) {
                $post->attachments()->create([
                    'user_id' => $user->id,
                    'disk_path' => $file->store("attachments/{$user->company_id}/newsfeed/{$post->id}", 'local'),
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType(),
                    'size' => $file->getSize(),
                ]);
            }

            return $post;
        });

        // Everyone who can see the post hears about it.
        $audience = User::where('company_id', $user->company_id)->where('is_active', true)->get(['id', 'company_id', 'is_company_admin', 'is_super_admin'])
            ->filter(fn (User $member) => $post->isVisibleTo($member))->pluck('id');
        $this->notifier->notify($audience, 'published a new post', "/newsfeed?post={$post->id}");

        return response()->json(['data' => $this->present(collect([$post]), $user)[0]], 201);
    }

    public function destroy(Request $request, NewsfeedPost $post): JsonResponse
    {
        $this->authorize('delete', $post);
        DB::transaction(function () use ($post) {
            $post->attachments->each->delete();
            $post->delete();
        });

        return response()->json(['message' => 'Post deleted.']);
    }

    public function pin(Request $request, NewsfeedPost $post): JsonResponse
    {
        $this->authorize('pin', NewsfeedPost::class);
        $pinned = $request->boolean('pinned', true);
        $post->update(['pinned' => $pinned, 'pinned_at' => $pinned ? now() : null]);

        return response()->json(['message' => $pinned ? 'Post pinned.' : 'Post unpinned.']);
    }

    public function like(Request $request, NewsfeedPost $post): JsonResponse
    {
        $this->authorize('view', $post);
        $user = $request->user();
        $key = ['newsfeed_post_id' => $post->id, 'user_id' => $user->id];

        if ($request->isMethod('delete')) {
            DB::table('newsfeed_post_likes')->where($key)->delete();
        } elseif (DB::table('newsfeed_post_likes')->insertOrIgnore([...$key, 'created_at' => now()])) {
            $this->notifier->notify([$post->user_id], 'likes your post', "/newsfeed?post={$post->id}");
        }

        return response()->json(['data' => $this->present(collect([$post->fresh()]), $user)[0]]);
    }

    /**
     * Who liked a post.
     */
    public function likes(Request $request, NewsfeedPost $post): JsonResponse
    {
        $this->authorize('view', $post);
        $ids = DB::table('newsfeed_post_likes')->where('newsfeed_post_id', $post->id)->orderBy('created_at')->pluck('user_id');

        return response()->json(['data' => User::whereIn('id', $ids)->get(['id', 'full_name', 'profile_photo'])->map(fn (User $u) => ['id' => $u->id, 'full_name' => $u->full_name, 'photo_url' => $u->photoUrl()])]);
    }

    public function comment(Request $request, NewsfeedPost $post): JsonResponse
    {
        $this->authorize('view', $post);
        $user = $request->user();
        $data = $request->validate(['content' => ['required', 'string', 'max:10000']]);
        $post->comments()->create(['user_id' => $user->id, 'content' => $data['content']]);
        $this->notifier->notify([$post->user_id], 'commented on your post', "/newsfeed?post={$post->id}");

        return response()->json(['data' => $this->present(collect([$post->fresh()]), $user)[0]], 201);
    }

    /**
     * The comment author, the post author or an admin may remove a comment.
     */
    public function deleteComment(Request $request, NewsfeedComment $comment): JsonResponse
    {
        $user = $request->user();
        $post = $comment->post;
        abort_unless($post && $post->isVisibleTo($user), 404);
        abort_unless(in_array((int) $user->id, [(int) $comment->user_id, (int) $post->user_id], true) || $user->isAdmin(), 403);
        $comment->delete();

        return response()->json(['data' => $this->present(collect([$post->fresh()]), $user)[0]]);
    }

    public function likeComment(Request $request, NewsfeedComment $comment): JsonResponse
    {
        $user = $request->user();
        $post = $comment->post;
        abort_unless($post && $post->isVisibleTo($user), 404);
        $key = ['newsfeed_comment_id' => $comment->id, 'user_id' => $user->id];

        if ($request->isMethod('delete')) {
            DB::table('newsfeed_comment_likes')->where($key)->delete();
        } elseif (DB::table('newsfeed_comment_likes')->insertOrIgnore([...$key, 'created_at' => now()])) {
            $this->notifier->notify([$comment->user_id], 'likes your comment', "/newsfeed?post={$post->id}");
        }

        return response()->json(['data' => $this->present(collect([$post]), $user)[0]]);
    }

    /**
     * @param  Collection<int, NewsfeedPost>  $posts
     * @return array<int, array<string, mixed>>
     */
    private function present(Collection $posts, User $me): array
    {
        $posts = new EloquentCollection($posts->all());
        $posts->load(['comments' => fn ($q) => $q->orderBy('id'), 'attachments.user']);
        $postIds = $posts->pluck('id');
        $commentIds = $posts->flatMap->comments->pluck('id');
        $postLikes = DB::table('newsfeed_post_likes')->whereIn('newsfeed_post_id', $postIds)->orderBy('created_at')->get()->groupBy('newsfeed_post_id');
        $commentLikes = DB::table('newsfeed_comment_likes')->whereIn('newsfeed_comment_id', $commentIds)->get()->groupBy('newsfeed_comment_id');
        $userIds = $posts->pluck('user_id')->concat($posts->flatMap->comments->pluck('user_id'))->concat($postLikes->flatten()->pluck('user_id'))->unique();
        $users = User::whereIn('id', $userIds)->get(['id', 'full_name', 'profile_photo'])->keyBy('id');
        $person = fn ($id) => ['id' => (int) $id, 'full_name' => $users[$id]->full_name ?? 'Unknown', 'photo_url' => isset($users[$id]) ? $users[$id]->photoUrl() : null];
        $departments = SupportDepartment::whereIn('id', $posts->pluck('visibility')->filter()->flatten()->unique())->pluck('name', 'id');

        return $posts->map(function (NewsfeedPost $post) use ($me, $person, $postLikes, $commentLikes, $departments) {
            $likes = $postLikes->get($post->id, collect());

            return [
                'id' => $post->id,
                'author' => $person($post->user_id),
                'content' => $post->content,
                'visibility' => $post->visibility ? collect($post->visibility)->map(fn ($id) => $departments[$id] ?? null)->filter()->values() : null,
                'pinned' => $post->pinned,
                'created_at' => $post->created_at?->toIso8601String(),
                'likes_count' => $likes->count(),
                'liked' => $likes->contains('user_id', $me->id),
                'likers' => $likes->take(3)->map(fn ($l) => $person($l->user_id)['full_name'])->values(),
                'can_delete' => (int) $post->user_id === (int) $me->id || $me->isAdmin(),
                'can_pin' => $me->isAdmin(),
                'attachments' => AttachmentResource::collection($post->attachments)->resolve(),
                'comments' => $post->comments->map(fn (NewsfeedComment $c) => [
                    'id' => $c->id,
                    'author' => $person($c->user_id),
                    'content' => $c->content,
                    'created_at' => $c->created_at?->toIso8601String(),
                    'likes_count' => $commentLikes->get($c->id, collect())->count(),
                    'liked' => $commentLikes->get($c->id, collect())->contains('user_id', $me->id),
                    'can_delete' => in_array((int) $me->id, [(int) $c->user_id, (int) $post->user_id], true) || $me->isAdmin(),
                ])->values(),
            ];
        })->values()->all();
    }
}
