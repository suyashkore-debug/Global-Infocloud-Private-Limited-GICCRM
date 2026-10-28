<?php

namespace App\Policies;

use App\Models\User;
use App\Policies\Concerns\OwnedDocumentRules;
use Illuminate\Database\Eloquent\Model;

/**
 * Perfex "estimate_request" permission: view all, or view_own for requests assigned to you.
 */
class EstimateRequestPolicy
{
    use OwnedDocumentRules;

    protected function feature(): string
    {
        return 'estimate_request';
    }

    protected function isOwn(User $user, Model $document): bool
    {
        return (int) $document->assigned_id === (int) $user->id;
    }
}
