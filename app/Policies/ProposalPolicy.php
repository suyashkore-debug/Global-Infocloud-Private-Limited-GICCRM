<?php

namespace App\Policies;

use App\Models\Proposal;
use App\Models\User;
use App\Policies\Concerns\OwnedDocumentRules;
use Illuminate\Database\Eloquent\Model;

class ProposalPolicy
{
    use OwnedDocumentRules;

    protected function feature(): string
    {
        return 'proposals';
    }

    /**
     * @param  Proposal  $document
     */
    protected function isOwn(User $user, Model $document): bool
    {
        return $document->isOwnedBy($user);
    }
}
