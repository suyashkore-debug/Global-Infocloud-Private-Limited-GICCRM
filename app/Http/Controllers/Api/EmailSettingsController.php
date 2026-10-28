<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\TemplateMail;
use App\Models\EmailLog;
use App\Models\EmailTemplate;
use App\Services\CompanyMailer;
use App\Services\Emails;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Setup → Email: the company's SMTP account, signature / header / footer, the e-mail templates
 * and the log of sent e-mails. Admins only.
 */
class EmailSettingsController extends Controller
{
    /** Merge fields available per template type (shown next to the editor). */
    private const MERGE_FIELDS = [
        'other' => ['companyname', 'crm_url', 'admin_url', 'main_domain', 'email_signature'],
        'client' => ['contact_firstname', 'contact_lastname', 'contact_email', 'contact_phonenumber', 'contact_title', 'client_company', 'client_phonenumber', 'client_city', 'client_state', 'client_zip', 'client_country', 'client_vat_number', 'client_website'],
        'invoice' => ['invoice_number', 'invoice_date', 'invoice_duedate', 'invoice_status', 'invoice_subtotal', 'invoice_total', 'invoice_amount_due', 'invoice_link', 'payment_total', 'payment_date'],
        'estimate' => ['estimate_number', 'estimate_date', 'estimate_expirydate', 'estimate_status', 'estimate_subtotal', 'estimate_total', 'estimate_link'],
        'proposals' => ['proposal_number', 'proposal_id', 'proposal_subject', 'proposal_open_till', 'proposal_proposal_to', 'proposal_subtotal', 'proposal_total', 'proposal_link', 'proposal_comment'],
        'credit_note' => ['credit_note_number', 'credit_note_date', 'credit_note_total', 'credit_note_status'],
        'contract' => ['contract_subject', 'contract_description', 'contract_datestart', 'contract_dateend', 'contract_contract_value', 'contract_link', 'contract_comment'],
        'tasks' => ['task_name', 'task_description', 'task_status', 'task_priority', 'task_startdate', 'task_duedate', 'task_link', 'task_related', 'task_comment', 'task_user_take_action', 'staff_firstname', 'staff_lastname'],
        'project' => ['project_name', 'project_description', 'project_start_date', 'project_deadline', 'project_link', 'discussion_subject', 'discussion_description', 'discussion_link', 'discussion_comment', 'discussion_creator', 'file_creator', 'staff_firstname', 'staff_lastname'],
        'staff' => ['staff_firstname', 'staff_lastname', 'staff_email', 'staff_reminder_description', 'staff_reminder_date', 'staff_reminder_relation_name', 'staff_reminder_relation_link'],
        'leads' => ['lead_name', 'lead_email', 'lead_position', 'lead_company', 'lead_phonenumber', 'lead_link', 'lead_assigned', 'staff_firstname', 'staff_lastname'],
        'ticket' => ['ticket_id', 'ticket_subject', 'ticket_message', 'ticket_priority', 'ticket_department', 'ticket_status', 'ticket_url', 'ticket_public_url', 'staff_firstname', 'staff_lastname'],
        'subscriptions' => ['subscription_name', 'subscription_link'],
    ];

    public function show(Request $request): JsonResponse
    {
        $company = $this->admin($request);

        return response()->json(['data' => [
            ...collect(CompanyMailer::KEYS)->reject(fn ($k) => $k === 'smtp_password')->mapWithKeys(fn ($k) => [$k => Options::get($k, $company)])->all(),
            'has_password' => Options::get('smtp_password', $company) !== '',
            'default_mailer' => (string) config('mail.default'),
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $data = $request->validate([
            'smtp_host' => ['nullable', 'string', 'max:191'],
            'smtp_port' => ['nullable', 'integer', 'between:1,65535'],
            'smtp_encryption' => ['nullable', Rule::in(['', 'ssl', 'tls'])],
            'smtp_username' => ['nullable', 'string', 'max:191'],
            'smtp_password' => ['nullable', 'string', 'max:500'],
            'clear_password' => ['boolean'],
            'smtp_email' => ['nullable', 'email', 'max:191'],
            'smtp_from_name' => ['nullable', 'string', 'max:191'],
            'email_signature' => ['nullable', 'string', 'max:20000'],
            'email_header' => ['nullable', 'string', 'max:50000'],
            'email_footer' => ['nullable', 'string', 'max:50000'],
        ]);

        foreach (['smtp_host', 'smtp_port', 'smtp_encryption', 'smtp_username', 'smtp_email', 'smtp_from_name', 'email_signature', 'email_header', 'email_footer'] as $key) {
            if (array_key_exists($key, $data)) {
                Options::set($key, (string) ($data[$key] ?? ''), $company);
            }
        }
        if (! empty($data['smtp_password'])) {
            CompanyMailer::setPassword($data['smtp_password'], $company);
        } elseif ($data['clear_password'] ?? false) {
            CompanyMailer::setPassword('', $company);
        }

        return $this->show($request);
    }

    /**
     * Send a test e-mail right away (not queued) so a wrong SMTP setting shows its error here.
     */
    public function test(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        $to = $request->validate(['to' => ['required', 'email']])['to'];
        $from = CompanyMailer::from($company);

        try {
            CompanyMailer::mailer($company)->to($to)->send(new TemplateMail(
                'SMTP setup testing',
                Emails::wrap('<p>This is a test e-mail from '.e(Options::get('company_name', $company) ?: config('app.name')).'. If you received it, the SMTP settings work.</p>', $company),
                $from['address'],
                $from['name'],
            ));
        } catch (Throwable $e) {
            return response()->json(['message' => 'Sending failed: '.$e->getMessage()], 422);
        }

        return response()->json(['message' => config('mail.default') === 'log' && Options::get('smtp_host', $company) === ''
            ? 'No SMTP server is set, so the e-mail was only written to the log file.'
            : "Test e-mail sent to {$to}."]);
    }

    public function templates(Request $request): JsonResponse
    {
        $company = $this->admin($request);
        Emails::ensureTemplates($company);

        return response()->json([
            'data' => EmailTemplate::orderBy('type')->orderBy('name')->get(['id', 'type', 'slug', 'name', 'subject', 'active']),
            'meta' => ['merge_fields' => self::MERGE_FIELDS],
        ]);
    }

    public function template(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => $emailTemplate, 'meta' => ['merge_fields' => [
            ...(self::MERGE_FIELDS[$emailTemplate->type] ?? []),
            ...(in_array($emailTemplate->type, ['invoice', 'estimate', 'credit_note', 'contract', 'client', 'ticket', 'proposals', 'project', 'tasks'], true) ? self::MERGE_FIELDS['client'] : []),
            ...self::MERGE_FIELDS['other'],
        ]]]);
    }

    public function updateTemplate(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->admin($request);
        $emailTemplate->update($request->validate([
            'subject' => ['required', 'string', 'max:500'],
            'message' => ['required', 'string', 'max:200000'],
            'from_name' => ['nullable', 'string', 'max:191'],
            'plaintext' => ['boolean'],
            'active' => ['boolean'],
        ]));

        return response()->json(['data' => $emailTemplate]);
    }

    /**
     * Enable / disable every template of a type (Perfex "Enable all" / "Disable all").
     */
    public function toggleType(Request $request, string $type): JsonResponse
    {
        $this->admin($request);
        $active = $request->validate(['active' => ['required', 'boolean']])['active'];
        EmailTemplate::where('type', $type)->update(['active' => $active]);

        return response()->json(['message' => $active ? 'Templates enabled.' : 'Templates disabled.']);
    }

    public function logs(Request $request): JsonResponse
    {
        $this->admin($request);
        $page = EmailLog::query()
            ->when($request->string('status')->value(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->string('search')->trim()->value(), fn ($q, $s) => $q->where(fn ($w) => $w->where('to', 'like', "%{$s}%")->orWhere('subject', 'like', "%{$s}%")))
            ->latest('id')->paginate(30);

        return response()->json(['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    private function admin(Request $request): int
    {
        abort_unless($request->user()->isAdmin(), 403);

        return (int) $request->user()->company_id;
    }
}
