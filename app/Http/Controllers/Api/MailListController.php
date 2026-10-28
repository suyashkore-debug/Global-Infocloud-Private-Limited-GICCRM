<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MailList;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Perfex survey mail lists: named lists of e-mail addresses to send surveys to.
 */
class MailListController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => MailList::withCount('emails')->orderBy('name')->get()]);
    }

    public function show(Request $request, MailList $mailList): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => [...$mailList->toArray(), 'emails' => $mailList->emails()->orderBy('email')->get(['id', 'email', 'created_at'])]]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $data = $request->validate(['name' => ['required', 'string', 'max:191']]);

        return response()->json(['data' => MailList::create([...$data, 'created_by' => $request->user()->id])], 201);
    }

    public function update(Request $request, MailList $mailList): JsonResponse
    {
        $this->allow($request, 'edit');
        $mailList->update($request->validate(['name' => ['required', 'string', 'max:191']]));

        return response()->json(['data' => $mailList]);
    }

    public function destroy(Request $request, MailList $mailList): JsonResponse
    {
        $this->allow($request, 'delete');
        $mailList->delete();

        return response()->json(['message' => 'Mail list deleted.']);
    }

    /**
     * Add one or many addresses (one per line / comma separated, as when importing). Invalid and
     * duplicate addresses are skipped.
     */
    public function addEmails(Request $request, MailList $mailList): JsonResponse
    {
        $this->allow($request, 'edit');
        $data = $request->validate(['emails' => ['required', 'string', 'max:500000']]);
        $emails = collect(preg_split('/[\s,;]+/', $data['emails']))->map(fn ($e) => strtolower(trim($e)))
            ->filter(fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL))->unique();
        $existing = $mailList->emails()->pluck('email')->all();
        $new = $emails->diff($existing);
        $new->each(fn ($email) => $mailList->emails()->create(['email' => $email]));

        return response()->json(['message' => "{$new->count()} e-mail(s) added".($emails->count() > $new->count() ? ', '.($emails->count() - $new->count()).' already in the list' : '').'.', 'added' => $new->count()]);
    }

    public function removeEmail(Request $request, MailList $mailList, int $email): JsonResponse
    {
        $this->allow($request, 'edit');
        $mailList->emails()->whereKey($email)->delete();

        return response()->json(['message' => 'Removed.']);
    }

    private function allow(Request $request, string $capability): void
    {
        abort_unless($request->user()->hasPermission('surveys', $capability), 403);
    }
}
