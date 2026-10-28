<?php

namespace App\Policies;

use App\Models\CreditNote;
use App\Models\User;
use App\Policies\Concerns\OwnedDocumentRules;
use Illuminate\Database\Eloquent\Model;

class CreditNotePolicy
{
    use OwnedDocumentRules;

    protected function feature(): string
    {
        return 'credit_notes';
    }

    /**
     * @param  CreditNote  $document
     */
    protected function isOwn(User $user, Model $document): bool
    {
        return (int) $document->created_by === (int) $user->id;
    }
}
