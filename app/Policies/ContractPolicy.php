<?php

namespace App\Policies;

use App\Models\User;
use App\Policies\Concerns\OwnedDocumentRules;
use Illuminate\Database\Eloquent\Model;

class ContractPolicy
{
    use OwnedDocumentRules;

    protected function feature(): string
    {
        return 'contracts';
    }

    protected function isOwn(User $user, Model $document): bool
    {
        return (int) $document->created_by === (int) $user->id;
    }
}
