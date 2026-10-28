<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Support\RichText;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

/**
 * A proposal or contract template (Perfex tbltemplates).
 */
class Template extends Model
{
    use BelongsToCompany;

    public const TYPES = ['proposals', 'contracts'];

    protected $fillable = ['company_id', 'type', 'name', 'content', 'created_by'];

    /**
     * @return Attribute<string|null, string|null>
     */
    protected function content(): Attribute
    {
        return Attribute::make(set: fn (?string $value) => RichText::clean($value));
    }

    /**
     * Perfex: the author or an admin edits and deletes a template.
     */
    public function canManage(User $user): bool
    {
        return (int) $this->created_by === (int) $user->id || $user->isAdmin();
    }
}
