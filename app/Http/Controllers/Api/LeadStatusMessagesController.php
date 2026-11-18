<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeadStatus;
use App\Services\DefaultLookups;
use App\Services\Emails;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Setup → Leads → "Messages to the lead": everything about the status-change e-mail and
 * WhatsApp message in one place — on / off, which statuses send them, and both drafts (the
 * e-mail is the "lead-status-changed" e-mail template, the WhatsApp text a company setting).
 */
class LeadStatusMessagesController extends Controller
{
    private const OPTIONS = ['lead_status_notify_staff', 'lead_status_email_lead', 'lead_status_whatsapp_lead'];

    public function show(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        DefaultLookups::ensureLeadLists();
        $template = Emails::template('lead-status-changed', $company);

        return response()->json(['data' => [
            ...collect(self::OPTIONS)->mapWithKeys(fn ($k) => [$k => Options::get($k, $company) === '1'])->all(),
            // Off when the template is switched off in Setup → Email Templates too.
            'lead_status_email_lead' => Options::get('lead_status_email_lead', $company) === '1' && (bool) $template?->active,
            'whatsapp_message' => Options::get('lead_status_whatsapp_message', $company),
            'email_subject' => $template?->subject ?? '',
            'email_message' => $template?->message ?? '',
            'statuses' => LeadStatus::with('pipeline:id,name,sort_order')->orderBy('status_order')->get(['id', 'name', 'color', 'notify_lead', 'is_default', 'pipeline_id'])
                ->sortBy(fn (LeadStatus $s) => [$s->pipeline?->sort_order ?? 999, $s->pipeline_id, $s->status_order])->values()
                ->map(fn (LeadStatus $s) => [...$s->only(['id', 'name', 'color', 'notify_lead', 'is_default']), 'pipeline_name' => $s->pipeline?->name]),
            // For the preview.
            'sample' => [
                'companyname' => Options::companyName($company),
                'email_signature' => Options::get('email_signature', $company),
                'lead_assigned' => $request->user()->full_name,
            ],
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $data = $request->validate([
            ...collect(self::OPTIONS)->mapWithKeys(fn ($k) => [$k => ['required', 'boolean']])->all(),
            'whatsapp_message' => ['required', 'string', 'max:1000'],
            'email_subject' => ['required', 'string', 'max:500'],
            'email_message' => ['required', 'string', 'max:200000'],
            'notify_status_ids' => ['present', 'array'],
            'notify_status_ids.*' => ['integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company)],
        ]);

        DB::transaction(function () use ($data, $company) {
            foreach (self::OPTIONS as $key) {
                Options::set($key, $data[$key] ? '1' : '0', $company);
            }
            Options::set('lead_status_whatsapp_message', trim($data['whatsapp_message']), $company);
            Emails::template('lead-status-changed', $company)?->update(['subject' => $data['email_subject'], 'message' => $data['email_message'], 'active' => $data['lead_status_email_lead']]);
            LeadStatus::query()->update(['notify_lead' => false]);
            LeadStatus::whereIn('id', $data['notify_status_ids'])->update(['notify_lead' => true]);
        });

        return $this->show($request);
    }

    private function admin(Request $request): int
    {
        abort_unless($request->user()->isAdmin(), 403);

        return (int) $request->user()->company_id;
    }
}
