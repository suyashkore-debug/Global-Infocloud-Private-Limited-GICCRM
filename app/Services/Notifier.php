<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Support\CurrentCompany;
use Illuminate\Support\Facades\Auth;

/**
 * In-app notifications (the bell), sent the way Perfex sends them: never to the person who did
 * the action.
 */
class Notifier
{
    /**
     * @param  iterable<int>  $userIds
     * @param  int|null  $companyId  needed when nobody is signed in (public web forms)
     */
    public function notify(iterable $userIds, string $description, ?string $link = null, ?int $companyId = null): void
    {
        $fromUserId = Auth::id();

        foreach (collect($userIds)->map(fn ($id) => (int) $id)->unique() as $userId) {
            if ($userId === (int) $fromUserId) {
                continue;
            }

            AppNotification::create([
                'company_id' => $companyId ?? CurrentCompany::id(),
                'user_id' => $userId,
                'from_user_id' => $fromUserId,
                'description' => $description,
                'link' => $link,
            ]);
        }
    }
}
