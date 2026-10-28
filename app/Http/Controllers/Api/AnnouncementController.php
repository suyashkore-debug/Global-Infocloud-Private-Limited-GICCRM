<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Utilities → Announcements. Admins write them; staff see the ones shown to staff and can dismiss
 * them from the dashboard.
 */
class AnnouncementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $dismissed = DB::table('announcement_dismissals')->where('user_id', $user->id)->pluck('announcement_id');

        $announcements = Announcement::query()
            ->unless($user->isAdmin(), fn ($q) => $q->where('show_to_staff', true))
            ->when($request->boolean('active'), fn ($q) => $q->where('show_to_staff', true)->whereNotIn('id', $dismissed))
            ->with('creator')
            ->latest()
            ->get()
            ->map(fn (Announcement $a) => [
                ...$a->only(['id', 'name', 'message', 'show_to_staff', 'show_to_customers', 'show_name', 'created_at']),
                'author' => $a->creator?->full_name,
                'dismissed' => $dismissed->contains($a->id),
            ]);

        return response()->json(['data' => $announcements]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $announcement = Announcement::create([...$this->validated($request), 'created_by' => $request->user()->id]);

        if ($announcement->show_to_staff) {
            foreach (User::where('company_id', $request->user()->company_id)->where('is_active', true)->pluck('id') as $userId) {
                if ($userId !== $request->user()->id) {
                    AppNotification::create(['user_id' => $userId, 'from_user_id' => $request->user()->id, 'description' => "posted announcement {$announcement->name}", 'link' => '/']);
                }
            }
        }

        return response()->json(['data' => $announcement], 201);
    }

    public function update(Request $request, Announcement $announcement): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $announcement->update($this->validated($request));

        return response()->json(['data' => $announcement]);
    }

    public function destroy(Request $request, Announcement $announcement): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $announcement->delete();

        return response()->json(['message' => 'Announcement deleted.']);
    }

    public function dismiss(Request $request, Announcement $announcement): JsonResponse
    {
        DB::table('announcement_dismissals')->updateOrInsert(['announcement_id' => $announcement->id, 'user_id' => $request->user()->id], ['created_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Dismissed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:300'],
            'message' => ['required', 'string', 'max:65000'],
            'show_to_staff' => ['boolean'],
            'show_to_customers' => ['boolean'],
            'show_name' => ['boolean'],
        ]);
    }
}
