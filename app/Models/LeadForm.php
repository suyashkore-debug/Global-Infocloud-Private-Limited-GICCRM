<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A Perfex "Web to Lead" form: a public form (link or embedded on the website) whose submissions
 * become leads with the form's status, source and responsible staff member.
 */
class LeadForm extends Model
{
    use BelongsToCompany;

    /** Lead fields a form field can fill; anything else is added to the lead's description. */
    public const LEAD_FIELDS = ['name', 'title', 'email', 'phone', 'lead_value', 'company', 'address', 'city', 'state', 'country', 'zip', 'description', 'website'];

    /** Fields a form may check for duplicates (Perfex "Track duplicate by field"). */
    public const DUPLICATE_FIELDS = ['email', 'phone', 'website', 'company', 'name'];

    protected $fillable = [
        'company_id', 'form_key', 'name', 'fields', 'lead_status_id', 'lead_source_id', 'responsible_id', 'lead_name_prefix', 'language',
        'submit_btn_name', 'submit_btn_bg_color', 'submit_btn_text_color', 'submit_action', 'success_submit_msg', 'submit_redirect_url',
        'mark_public', 'allow_duplicate', 'track_duplicate_field', 'track_duplicate_field_and', 'create_task_on_duplicate',
        'notify_lead_imported', 'notify_type', 'notify_ids', 'active', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'fields' => 'array',
            'notify_ids' => 'array',
            'mark_public' => 'boolean',
            'allow_duplicate' => 'boolean',
            'create_task_on_duplicate' => 'boolean',
            'notify_lead_imported' => 'boolean',
            'active' => 'boolean',
        ];
    }

    /**
     * @return HasMany<Lead, $this>
     */
    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    /**
     * Staff to tell about a new lead from this form: chosen staff, members of chosen HRMS roles, or
     * the form's responsible person.
     *
     * @return array<int, int>
     */
    public function notifyUserIds(): array
    {
        if (! $this->notify_lead_imported) {
            return [];
        }
        $ids = array_map('intval', $this->notify_ids ?? []);

        return match ($this->notify_type) {
            'specific_staff' => User::where('company_id', $this->company_id)->whereIn('id', $ids)->pluck('id')->all(),
            'roles' => User::where('company_id', $this->company_id)->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $ids))->pluck('id')->all(),
            default => array_filter([(int) $this->responsible_id]),
        };
    }
}
