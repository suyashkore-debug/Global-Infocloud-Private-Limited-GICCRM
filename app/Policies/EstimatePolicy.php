<?php

namespace App\Policies;

use App\Models\Estimate;
use App\Models\User;
use App\Policies\Concerns\OwnedDocumentRules;
use Illuminate\Database\Eloquent\Model;

class EstimatePolicy
{
    use OwnedDocumentRules;

    protected function feature(): string
    {
        return 'estimates';
    }

    /**
     * @param  Estimate  $document
     */
    protected function isOwn(User $user, Model $document): bool
    {
        return $document->isOwnedBy($user);
    }
}
