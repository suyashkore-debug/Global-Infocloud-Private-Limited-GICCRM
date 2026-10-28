<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Template;
use App\Models\User;
use App\Support\RichText;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Proposal and contract templates. Everyone sees their own; "View all templates" shows the
 * whole team's. The author or an admin changes them.
 */
class TemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();
        $type = $request->validate(['type' => ['required', Rule::in(Template::TYPES)]])['type'];
        abort_unless($this->canWrite($me, $type), 403);

        $templates = Template::where('type', $type)
            ->when(! $this->seesAll($me, $type), fn ($q) => $q->where('created_by', $me->id))
            ->orderBy('name')->get();
        $authors = User::whereIn('id', $templates->pluck('created_by')->unique())->pluck('full_name', 'id');

        return response()->json(['data' => $templates->map(fn (Template $t) => $this->present($t, $me, $authors[$t->created_by] ?? null))]);
    }

    public function show(Request $request, Template $template): JsonResponse
    {
        $me = $request->user();
        abort_unless($this->canWrite($me, $template->type) && ($template->canManage($me) || $this->seesAll($me, $template->type)), 403);

        return response()->json(['data' => [...$this->present($template, $me, null), 'content' => $template->content, 'content_html' => RichText::toHtml($template->content)]]);
    }

    public function store(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $this->validated($request);
        abort_unless($this->canWrite($me, $data['type']), 403);

        $template = Template::create([...$data, 'created_by' => $me->id]);

        return response()->json(['data' => $this->present($template, $me, $me->full_name)], 201);
    }

    public function update(Request $request, Template $template): JsonResponse
    {
        $me = $request->user();
        abort_unless($template->canManage($me), 403);
        $template->update(collect($this->validated($request))->except('type')->all());

        return response()->json(['data' => $this->present($template, $me, null)]);
    }

    public function destroy(Request $request, Template $template): JsonResponse
    {
        abort_unless($template->canManage($request->user()), 403);
        $template->delete();

        return response()->json(['message' => 'Template deleted.']);
    }

    /**
     * @return array{type: string, name: string, content: string|null}
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'type' => [$request->isMethod('post') ? 'required' : 'sometimes', Rule::in(Template::TYPES)],
            'name' => ['required', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:500000'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Template $t, User $me, ?string $author): array
    {
        return [
            'id' => $t->id,
            'type' => $t->type,
            'name' => $t->name,
            'author' => $author,
            'is_own' => (int) $t->created_by === (int) $me->id,
            'can_manage' => $t->canManage($me),
            'updated_at' => $t->updated_at,
        ];
    }

    /**
     * Templates are for whoever writes proposals / contracts.
     */
    private function canWrite(User $user, string $type): bool
    {
        return $user->hasPermission($type, 'create') || $user->hasPermission($type, 'edit');
    }

    private function seesAll(User $user, string $type): bool
    {
        return $user->isAdmin() || $user->hasPermission($type, 'view_all_templates');
    }
}
