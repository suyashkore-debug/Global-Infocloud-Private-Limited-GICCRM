<?php

namespace App\Services;

use App\Jobs\SendTemplateEmail;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\CreditNote;
use App\Models\Customer;
use App\Models\EmailLog;
use App\Models\EmailTemplate;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Payment;
use App\Models\Project;
use App\Models\Proposal;
use App\Models\Task;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Perfex e-mail templates: merge fields for each record type, rendering, and sending through
 * the company's SMTP account (queued). Every e-mail is logged.
 */
class Emails
{
    /**
     * Create the company's templates from GIC's defaults the first time they are needed (and
     * add templates that are new since).
     */
    public static function ensureTemplates(int $companyId): void
    {
        $existing = EmailTemplate::withoutGlobalScopes()->where('company_id', $companyId)->pluck('slug')->all();
        $defaults = json_decode((string) file_get_contents(database_path('data/email_templates.json')), true);

        foreach ($defaults as $t) {
            if (! in_array($t['slug'], $existing, true)) {
                EmailTemplate::create([...$t, 'company_id' => $companyId]);
            }
        }
    }

    public static function template(string $slug, int $companyId): ?EmailTemplate
    {
        self::ensureTemplates($companyId);

        return EmailTemplate::withoutGlobalScopes()->where('company_id', $companyId)->where('slug', $slug)->first();
    }

    /**
     * Render a template with merge fields: [subject, html, from name].
     *
     * @param  array<string, string|null>  $fields
     * @return array{subject: string, html: string, from_name: string}
     */
    public static function render(EmailTemplate $template, array $fields, int $companyId, ?string $subject = null, ?string $message = null): array
    {
        $fields = [...self::companyFields($companyId), ...$fields];
        $body = self::merge($message ?? $template->message, $fields, true);
        if ($template->plaintext && $message === null) {
            $body = nl2br(e($body));
        }

        return [
            'subject' => html_entity_decode(strip_tags(self::merge($subject ?? $template->subject, $fields, false))),
            'html' => self::wrap($body, $companyId),
            'from_name' => self::merge((string) $template->from_name, $fields, false),
        ];
    }

    /**
     * Send a template. Inactive templates are skipped unless $options['force'] (a person
     * pressing "Send" always sends).
     *
     * @param  string|array<int, string>  $to
     * @param  array<string, string|null>  $fields
     * @param  array{cc?: array<int, string>, attachments?: array<int, array{name: string, mime: string, data: string}>, subject?: string|null, message?: string|null, rel?: Model|null, force?: bool}  $options
     */
    public static function send(string $slug, int $companyId, string|array $to, array $fields, array $options = []): ?EmailLog
    {
        $to = array_values(array_unique(array_filter(array_map(fn ($e) => strtolower(trim((string) $e)), (array) $to), fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL))));
        $template = self::template($slug, $companyId);
        if (! $template || $to === [] || (! $template->active && ! ($options['force'] ?? false))) {
            return null;
        }

        $mail = self::render($template, $fields, $companyId, $options['subject'] ?? null, $options['message'] ?? null);
        $cc = array_values(array_filter($options['cc'] ?? [], fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));
        $rel = $options['rel'] ?? null;

        $log = EmailLog::create([
            'company_id' => $companyId,
            'template' => $slug,
            'to' => implode(', ', $to),
            'cc' => $cc ? implode(', ', $cc) : null,
            'subject' => mb_substr($mail['subject'], 0, 500),
            'rel_type' => $rel ? strtolower(class_basename($rel)) : null,
            'rel_id' => $rel?->getKey(),
            'user_id' => Auth::id(),
        ]);

        $from = CompanyMailer::from($companyId, $mail['from_name'] ?: null);
        $files = array_map(fn ($f) => [...$f, 'data' => base64_encode($f['data'])], $options['attachments'] ?? []);
        SendTemplateEmail::dispatch($companyId, $log->id, $to, $cc, $mail['subject'], $mail['html'], $from['address'], $from['name'], $files);

        return $log;
    }

    /**
     * Send the same template to several staff members, each with their own staff fields.
     *
     * @param  iterable<int>  $userIds
     * @param  array<string, string|null>  $fields
     */
    public static function toStaff(string $slug, int $companyId, iterable $userIds, array $fields, ?Model $rel = null): void
    {
        $skip = (int) Auth::id();
        foreach (User::whereIn('id', collect($userIds)->map(fn ($id) => (int) $id)->unique()->reject(fn ($id) => $id === $skip))->get() as $user) {
            self::send($slug, $companyId, (string) $user->email, [...$fields, ...self::staff($user)], ['rel' => $rel]);
        }
    }

    // Merge fields -----------------------------------------------------------------------------

    /**
     * @return array<string, string|null>
     */
    public static function companyFields(int $companyId): array
    {
        $url = rtrim((string) config('app.url'), '/');

        return [
            'companyname' => Options::companyName($companyId),
            'crm_url' => $url,
            'admin_url' => $url,
            'main_domain' => $url,
            'email_signature' => Options::get('email_signature', $companyId),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function staff(User $user): array
    {
        return ['staff_firstname' => $user->first_name ?: $user->full_name, 'staff_lastname' => $user->last_name, 'staff_email' => $user->email];
    }

    /**
     * @return array<string, string|null>
     */
    public static function contact(?Contact $contact): array
    {
        return [
            'contact_firstname' => $contact?->first_name,
            'contact_lastname' => $contact?->last_name,
            'contact_email' => $contact?->email,
            'contact_phonenumber' => $contact?->phone,
            'contact_title' => $contact?->title,
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function customer(?Customer $customer): array
    {
        return [
            'client_company' => $customer?->name,
            'client_phonenumber' => $customer?->phone,
            'client_city' => $customer?->city,
            'client_state' => $customer?->state,
            'client_zip' => $customer?->zip,
            'client_country' => $customer?->country,
            'client_vat_number' => $customer?->vat,
            'client_website' => $customer?->website,
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function invoice(Invoice $invoice): array
    {
        $money = fn ($v) => self::money($v, $invoice);

        return [
            ...self::customer($invoice->customer),
            'invoice_number' => $invoice->formattedNumber(),
            'invoice_date' => $invoice->date?->format('d-m-Y'),
            'invoice_duedate' => $invoice->due_date?->format('d-m-Y'),
            'invoice_status' => $invoice->status->label(),
            'invoice_subtotal' => $money($invoice->subtotal),
            'invoice_total' => $money($invoice->total),
            'invoice_amount_due' => $money($invoice->amountDue()),
            'invoice_link' => self::publicLink('invoice', $invoice),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function estimate(Estimate $estimate): array
    {
        return [
            ...self::customer($estimate->customer),
            'estimate_number' => $estimate->formattedNumber(),
            'estimate_date' => $estimate->date?->format('d-m-Y'),
            'estimate_expirydate' => $estimate->expiry_date?->format('d-m-Y'),
            'estimate_status' => $estimate->status->label(),
            'estimate_subtotal' => self::money($estimate->subtotal, $estimate),
            'estimate_total' => self::money($estimate->total, $estimate),
            'estimate_link' => self::publicLink('estimate', $estimate),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function proposal(Proposal $proposal): array
    {
        return [
            'proposal_number' => $proposal->formattedNumber(),
            'proposal_id' => (string) $proposal->id,
            'proposal_subject' => $proposal->subject,
            'proposal_open_till' => $proposal->open_till?->format('d-m-Y'),
            'proposal_proposal_to' => $proposal->proposal_to,
            'proposal_subtotal' => self::money($proposal->subtotal, $proposal),
            'proposal_total' => self::money($proposal->total, $proposal),
            'proposal_link' => self::publicLink('proposal', $proposal),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function creditNote(CreditNote $note): array
    {
        return [
            ...self::customer($note->customer),
            'credit_note_number' => $note->formattedNumber(),
            'credit_note_date' => $note->date?->format('d-m-Y'),
            'credit_note_total' => self::money($note->total, $note),
            'credit_note_status' => $note->status->label(),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function contract(Contract $contract): array
    {
        return [
            ...self::customer($contract->customer),
            'contract_subject' => $contract->subject,
            'contract_description' => $contract->description,
            'contract_datestart' => $contract->start_date?->format('d-m-Y'),
            'contract_dateend' => $contract->end_date?->format('d-m-Y'),
            'contract_contract_value' => $contract->contract_value !== null ? number_format((float) $contract->contract_value, 2) : null,
            'contract_link' => self::publicLink('contract', $contract),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function payment(Payment $payment): array
    {
        return [
            ...self::invoice($payment->invoice),
            'payment_total' => self::money($payment->amount, $payment->invoice),
            'payment_date' => $payment->date?->format('d-m-Y'),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function task(Task $task): array
    {
        return [
            'task_name' => $task->name,
            'task_description' => $task->description,
            'task_status' => $task->status->label(),
            'task_priority' => $task->priority->label(),
            'task_startdate' => $task->start_date?->format('d-m-Y'),
            'task_duedate' => $task->due_date?->format('d-m-Y'),
            'task_link' => self::url('/tasks?task='.$task->id),
            'task_related' => $task->project?->name,
            ...($task->project ? self::project($task->project) : []),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function project(Project $project): array
    {
        return [
            'project_name' => $project->name,
            'project_description' => $project->description,
            'project_start_date' => $project->start_date?->format('d-m-Y'),
            'project_deadline' => $project->deadline?->format('d-m-Y'),
            'project_link' => self::url('/projects/'.$project->id),
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function lead(Lead $lead): array
    {
        return [
            'lead_name' => $lead->name,
            'lead_email' => $lead->email,
            'lead_position' => $lead->title,
            'lead_company' => $lead->company,
            'lead_phonenumber' => $lead->phone,
            'lead_link' => self::url('/leads?lead='.$lead->id),
            'lead_assigned' => $lead->assigned_id ? User::find($lead->assigned_id)?->full_name : null,
        ];
    }

    /**
     * @return array<string, string|null>
     */
    public static function ticket(Ticket $ticket, ?string $message = null): array
    {
        return [
            'ticket_id' => (string) $ticket->id,
            'ticket_subject' => $ticket->subject,
            'ticket_message' => $message ?? $ticket->message,
            'ticket_priority' => $ticket->priority?->name,
            'ticket_department' => $ticket->department?->name,
            'ticket_status' => $ticket->status?->name,
            'ticket_url' => self::url('/tickets/'.$ticket->id),
            'ticket_public_url' => self::url('/tickets/'.$ticket->id),
        ];
    }

    public static function url(string $path): string
    {
        return rtrim((string) config('app.url'), '/').$path;
    }

    /**
     * The customer-facing page of a document (no login, protected by its hash).
     */
    public static function publicLink(string $type, Model $document): string
    {
        return self::url("/{$type}/{$document->getKey()}/{$document->getAttribute('hash')}");
    }

    private static function money(mixed $value, Model $document): string
    {
        $currency = $document->getRelationValue('currency');
        $amount = number_format((float) $value, 2);
        $symbol = $currency?->symbol ?? '';

        return $currency?->placement === 'after' ? "{$amount} {$symbol}" : "{$symbol}{$amount}";
    }

    /**
     * Replace {merge_fields}. Values are escaped in HTML (the e-mail signature is the admin's
     * own HTML and is kept); fields without a value are removed.
     *
     * @param  array<string, string|null>  $fields
     */
    private static function merge(string $text, array $fields, bool $html): string
    {
        return preg_replace_callback('/\{([a-z0-9_]+)\}/', function ($m) use ($fields, $html) {
            if (! array_key_exists($m[1], $fields)) {
                return '';
            }
            $value = (string) ($fields[$m[1]] ?? '');

            return $html && $m[1] !== 'email_signature' ? nl2br(e($value)) : $value;
        }, $text) ?? $text;
    }

    /**
     * The e-mail around a message. Settings → Email "header" / "footer" HTML wins when set;
     * otherwise the GIC Folks layout: company logo on navy, the message on a white card, and the
     * company's details underneath.
     */
    public static function wrap(string $body, int $companyId): string
    {
        $header = Options::get('email_header', $companyId);
        $footer = Options::get('email_footer', $companyId);
        if ($header !== '' || $footer !== '') {
            return ($header ?: '<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; line-height: 1.5;"><div style="max-width: 680px; margin: 0 auto; padding: 16px;">')
                .$body
                .($footer ?: '</div></body></html>');
        }

        return view('emails.layout', [
            'body' => $body,
            'companyName' => Options::companyName($companyId) ?: (string) Company::find($companyId)?->company_name,
            'logo' => Company::find($companyId)?->logoUrl(),
            'options' => Options::all($companyId),
        ])->render();
    }
}
