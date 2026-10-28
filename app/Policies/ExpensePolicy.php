<?php

namespace App\Policies;

use App\Models\User;
use App\Policies\Concerns\OwnedDocumentRules;
use Illuminate\Database\Eloquent\Model;

class ExpensePolicy
{
    use OwnedDocumentRules;

    protected function feature(): string
    {
        return 'expenses';
    }

    protected function isOwn(User $user, Model $document): bool
    {
        return (int) $document->created_by === (int) $user->id;
    }
}
