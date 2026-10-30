<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Lead;
use App\Models\LeadForm;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\Task;
use App\Services\DefaultLookups;
use App\Services\Emails;
use App\Services\Notifier;
use App\Services\Options;
use App\Services\Recaptcha;
use App\Support\PublicFormFields;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The public "Web to Lead" form (Perfex forms/wtl/{key}): no login, found by its key. A submission
 * becomes a lead (or, when it repeats an existing lead and the form tracks duplicates, optionally a
 * task on that lead), and the chosen staff are told.
 */
class PublicLeadFormController extends Controller
{
    public function show(string $key): JsonResponse
    {
        $form = $this->form($key);

        return response()->json(['data' => [
            ...$form->only(['name', 'fields', 'submit_btn_name', 'submit_btn_bg_color', 'submit_btn_text_color']),
            'recaptcha_site_key' => Recaptcha::forForm($form->recaptcha, $form->company_id),
        ]]);
    }

    public function submit(Request $request, string $key, Notifier $notifier): JsonResponse
    {
        $form = $this->form($key);
        // The rest of the request works for the form's company (company scopes, defaults).
        $request->attributes->set('portal_company_id', $form->company_id);
        if (Recaptcha::forForm($form->recaptcha, $form->company_id)) {
            Recaptcha::check($request->input('g-recaptcha-response'), $request->ip(), $form->company_id);
        }
        $data = $request->validate(PublicFormFields::rules($form->fields));

        [$fields, $custom, $extra] = $this->split($form, $data);
        $done = response()->json([
            'message' => $form->success_submit_msg ?: 'Thank you! We have received your details and will get back to you soon.',
            'redirect_url' => $form->submit_action === 'redirect' ? $form->submit_redirect_url : null,
        ], 201);

        if (! $form->allow_duplicate && ($duplicate = $this->duplicateOf($form, $fields))) {
            if ($form->create_task_on_duplicate) {
                $this->taskOnDuplicate($form, $duplicate, $fields, $custom, $extra, $notifier);
            }

            return $done;
        }

        $lead = DB::transaction(function () use ($form, $fields, $custom, $extra, $request) {
            DefaultLookups::ensureLeadLists();
            $description = trim(implode("\n", array_filter([$fields['description'] ?? null, ...array_map(fn ($e) => "{$e['label']}: {$e['value']}", $extra)])));
            $name = $fields['name'] ?? $fields['company'] ?? $fields['email'] ?? $form->name;

            $lead = Lead::create([
                ...$fields,
                'company_id' => $form->company_id,
                'name' => mb_substr(trim(($form->lead_name_prefix ? "{$form->lead_name_prefix} " : '').$name), 0, 300),
                'description' => $description !== '' ? $description : null,
                'lead_status_id' => $form->lead_status_id ?? ((int) Options::get('leads_default_status') ?: LeadStatus::orderBy('status_order')->value('id')),
                'lead_source_id' => $form->lead_source_id ?? ((int) Options::get('leads_default_source') ?: LeadSource::orderBy('id')->value('id')),
                'assigned_id' => $form->responsible_id,
                'assigned_at' => $form->responsible_id ? today() : null,
                'is_public' => $form->mark_public,
                'default_language' => $form->language,
                'lead_form_id' => $form->id,
                'last_status_change_at' => now(),
                'created_by' => $form->created_by,
            ]);
            foreach ($custom as $fieldId => $value) {
                CustomFieldValue::create(['custom_field_id' => $fieldId, 'rel_id' => $lead->id, 'value' => $value]);
            }
            foreach ($form->fields as $field) {
                if ($field['type'] !== 'file') {
                    continue;
                }
                foreach ($request->file($field['name'], []) as $file) {
                    $lead->attachments()->create([
                        'company_id' => $form->company_id,
                        'user_id' => 0,
                        'disk_path' => $file->store("attachments/{$form->company_id}/leads/{$lead->id}", 'local'),
                        'original_name' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(),
                        'size' => $file->getSize(),
                    ]);
                }
            }
            $lead->logActivity("Created lead from the web form \"{$form->name}\"");

            return $lead;
        });

        $link = "/leads?lead={$lead->id}";
        $notifier->notify(array_diff($form->notifyUserIds(), [(int) $form->responsible_id]), "New lead from the web form {$form->name}: {$lead->name}", $link, $form->company_id);
        if ($form->responsible_id) {
            $notifier->notify([$form->responsible_id], "Lead #{$lead->id} from the web form {$form->name} has been assigned to you", $link, $form->company_id);
            Emails::toStaff('new-lead-assigned', $form->company_id, [$form->responsible_id], Emails::lead($lead), $lead);
        }
        // Perfex "Web to lead form submitted - Sent to lead": a thank-you to the lead (when the template is on).
        if ($lead->email) {
            Emails::send('new-web-to-lead-form-submitted', $form->company_id, $lead->email, Emails::lead($lead), ['rel' => $lead]);
        }

        return $done;
    }

    /**
     * The submitted values as lead fields, custom field values (cf_<id>) and extra answers (anything
     * else, added to the description).
     *
     * @param  array<string, mixed>  $data
     * @return array{0: array<string, mixed>, 1: array<int, string>, 2: array<int, array{label: string, value: string}>}
     */
    private function split(LeadForm $form, array $data): array
    {
        $customIds = CustomField::where('field_to', 'leads')->pluck('id')->all();
        $fields = [];
        $custom = [];
        $extra = [];
        foreach ($form->fields as $field) {
            $value = $data[$field['name']] ?? null;
            if ($field['type'] === 'file' || $value === null || $value === '' || $value === []) {
                continue;
            }
            $value = is_array($value) ? implode(', ', $value) : trim((string) $value);
            if (in_array($field['name'], LeadForm::LEAD_FIELDS, true)) {
                $fields[$field['name']] = $field['name'] === 'lead_value' ? (float) $value : mb_substr($value, 0, $field['name'] === 'description' ? 65000 : 300);
            } elseif (preg_match('/^cf_(\d+)$/', $field['name'], $m) && in_array((int) $m[1], $customIds, true)) {
                $custom[(int) $m[1]] = $value;
            } else {
                $extra[] = ['label' => $field['label'], 'value' => $value];
            }
        }
        if (isset($fields['email'])) {
            $fields['email'] = mb_strtolower($fields['email']);
        }

        return [$fields, $custom, $extra];
    }

    /**
     * The one existing lead this submission repeats on the tracked field(s), if any.
     *
     * @param  array<string, mixed>  $fields
     */
    private function duplicateOf(LeadForm $form, array $fields): ?Lead
    {
        $where = [];
        foreach (array_filter([$form->track_duplicate_field, $form->track_duplicate_field_and]) as $column) {
            if (! empty($fields[$column])) {
                $where[$column] = $fields[$column];
            }
        }
        if (! $where) {
            return null;
        }

        return Lead::where($where)->oldest('id')->first();
    }

    /**
     * Perfex "create the duplicate form data as task": a task on the existing lead with what was sent.
     *
     * @param  array<string, mixed>  $fields
     * @param  array<int, string>  $custom
     * @param  array<int, array{label: string, value: string}>  $extra
     */
    private function taskOnDuplicate(LeadForm $form, Lead $lead, array $fields, array $custom, array $extra, Notifier $notifier): void
    {
        $labels = collect($form->fields)->pluck('label', 'name');
        $lines = [];
        foreach ($fields as $name => $value) {
            $lines[] = ($labels[$name] ?? $name).": {$value}";
        }
        foreach ($custom as $id => $value) {
            $lines[] = ($labels["cf_{$id}"] ?? "Field {$id}").": {$value}";
        }
        foreach ($extra as $e) {
            $lines[] = "{$e['label']}: {$e['value']}";
        }
        $who = $fields['name'] ?? $fields['email'] ?? $fields['company'] ?? null;

        $task = Task::create([
            'company_id' => $form->company_id,
            'lead_id' => $lead->id,
            'name' => mb_substr(($who ? "{$who} - " : '').$form->name, 0, 191),
            'description' => $form->name."\n\n".implode("\n", $lines),
            'priority' => 2,
            'status' => TaskStatus::NotStarted,
            'start_date' => today(),
            'created_by' => $form->created_by,
        ]);
        if ($form->responsible_id) {
            $task->assignees()->create(['user_id' => $form->responsible_id]);
            $notifier->notify([$form->responsible_id], "A repeat web form submission was added as a task on lead {$lead->name}", "/leads?lead={$lead->id}", $form->company_id);
        }
        $lead->logActivity("Web form \"{$form->name}\" sent again; added as a task");
    }

    private function form(string $key): LeadForm
    {
        return LeadForm::withoutGlobalScopes()->where('form_key', $key)->where('active', true)->firstOrFail();
    }
}
