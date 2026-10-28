<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Option;
use App\Support\CurrentCompany;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/**
 * Company settings (Perfex get_option / update_option), with Perfex's defaults.
 */
class Options
{
    /** @var array<string, string> */
    public const DEFAULTS = [
        // Company details printed on PDFs.
        'company_name' => '',
        'company_address' => '',
        'company_city' => '',
        'company_state' => '',
        'company_zip' => '',
        'company_country' => '',
        'company_phone' => '',
        'company_vat' => '',
        'company_email' => '',
        // Numbering.
        'number_padding_prefixes' => '6',
        'invoice_prefix' => 'INV-',
        'next_invoice_number' => '1',
        'invoice_number_format' => '1',
        'invoice_due_after' => '30',
        'predefined_terms_invoice' => '',
        'predefined_clientnote_invoice' => '',
        'estimate_prefix' => 'EST-',
        'next_estimate_number' => '1',
        'estimate_number_format' => '1',
        'estimate_due_after' => '7',
        'predefined_terms_estimate' => '',
        'predefined_clientnote_estimate' => '',
        'proposal_number_prefix' => 'PRO-',
        'proposal_due_after' => '7',
        'credit_note_prefix' => 'CN-',
        'next_credit_note_number' => '1',
        'credit_note_number_format' => '1',
        'predefined_terms_credit_note' => '',
        'predefined_clientnote_credit_note' => '',
        // Contracts: notify the contract's creator this many days before it ends.
        'contract_expiration_before' => '4',
        // Tasks (Perfex Settings → Tasks).
        'auto_stop_tasks_timers_on_new_timer' => '1',
        'timer_started_change_status_in_progress' => '1',
        // Perfex "Round off task timer": 0 don't, 1 up, 2 down, 3 nearest, in multiples of N minutes.
        'round_off_task_timer_option' => '0',
        'round_off_task_timer_time' => '5',
        // Perfex Cron Job "Automatically stop task timers after (hours)"; 0 = never. GIC uses 10.
        'automatically_stop_task_timer_after_hours' => '10',
        // Customers (Perfex Settings → Customers).
        'customer_default_country' => 'India',
        'default_contact_permissions' => 'invoices,estimates,contracts,proposals,support,projects',
        'allow_primary_contact_to_view_edit_billing_and_shipping' => '1',
        'use_knowledge_base' => '1',
        // Support (Perfex Settings → Support).
        'ticket_services_enabled' => '1',
        'only_show_contact_tickets' => '1',
        'allow_customer_to_change_ticket_status' => '0',
        'ticket_replies_order' => 'asc',
        'default_ticket_reply_status' => '',
        'maximum_allowed_ticket_attachments' => '4',
        'ticket_attachments_file_extensions' => '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar',
        'receive_notification_on_new_ticket' => '1',
        'receive_notification_on_new_ticket_replies' => '1',
        'automatically_assign_ticket_to_first_staff_responding' => '0',
        // Leads (Perfex Settings → Leads).
        'leads_default_status' => '',
        'leads_default_source' => '',
        'lead_lock_after_convert_to_customer' => '0',
        'lead_unique_validation' => 'email',
        'auto_assign_customer_admin_after_lead_convert' => '1',
        // WhatsApp with leads (Setup → WhatsApp). Numbers typed without a country code get this one.
        // meta = Meta Cloud API directly; bird = through a Bird (platform.bird.com) workspace.
        'whatsapp_provider' => 'meta',
        'whatsapp_phone_number_id' => '',
        'whatsapp_bird_workspace_id' => '',
        'whatsapp_bird_channel_id' => '',
        // Bird templates: the Studio project id goes in whatsapp_template_name.
        'whatsapp_bird_template_version' => '',
        'whatsapp_bird_template_param' => 'name',
        'whatsapp_verify_token' => '',
        'whatsapp_country_code' => '91',
        'whatsapp_template_name' => 'hello_world',
        'whatsapp_template_language' => 'en_US',
        'whatsapp_template_lead_name' => '0',
        // Calls through Exotel (Setup → Calls). Mumbai accounts use api.in.exotel.com.
        'calls_provider' => '',
        'calls_exotel_subdomain' => 'api.exotel.com',
        'calls_exotel_sid' => '',
        'calls_caller_id' => '',
        'calls_record' => '1',
        'calls_country_code' => '91',
        // Calendar (Perfex Settings → Calendar). First day: 0 Sunday … 6 Saturday.
        'calendar_first_day' => '1',
        'show_tasks_on_calendar' => '1',
        'calendar_only_assigned_tasks' => '0',
        'show_projects_on_calendar' => '1',
        'show_invoices_on_calendar' => '1',
        'show_estimates_on_calendar' => '1',
        'show_contracts_on_calendar' => '1',
        'show_reminders_on_calendar' => '1',
        // PDF (Perfex Settings → PDF).
        'pdf_format' => 'A4-PORTRAIT',
        'pdf_font_size' => '10',
        'pdf_table_heading_color' => '#0b2c56',
        'pdf_table_heading_text_color' => '#ffffff',
        'show_status_on_pdf_ei' => '1',
        'show_page_number_on_pdf' => '1',
        'swap_pdf_info' => '0',
        'show_transactions_on_invoice_pdf' => '1',
        // Chat: customers can chat with staff from the customers area.
        'chat_clients_enabled' => '1',
        // Purchase (GIC's numbering from Perfex).
        'pur_request_prefix' => '#PR',
        'next_pr_number' => '1',
        'pur_order_prefix' => '#PO',
        'next_po_number' => '1',
        'pur_inv_prefix' => 'BILL# ',
        'next_pur_inv_number' => '1',
        'pur_terms_and_conditions' => '',
        'pur_vendor_note' => '',
    ];

    /** @var array<int, array<string, string>> */
    private static array $cache = [];

    /** Settings every staff member's screens may read (no secrets). */
    public const PUBLIC = [
        'customer_default_country', 'default_contact_permissions', 'ticket_services_enabled', 'ticket_replies_order', 'default_ticket_reply_status',
        'maximum_allowed_ticket_attachments', 'ticket_attachments_file_extensions', 'leads_default_status', 'leads_default_source',
        'calendar_first_day', 'lead_unique_validation',
    ];

    public static function get(string $name, ?int $companyId = null): string
    {
        $companyId ??= (int) CurrentCompany::id();
        self::$cache[$companyId] ??= Option::withoutGlobalScopes()->where('company_id', $companyId)->pluck('value', 'name')->all();

        return (string) (self::$cache[$companyId][$name] ?? self::DEFAULTS[$name] ?? '');
    }

    /**
     * @return array<string, string>
     */
    public static function all(?int $companyId = null): array
    {
        return collect(self::DEFAULTS)->map(fn ($default, $name) => self::get($name, $companyId))->all();
    }

    /**
     * Perfex: deleting the most recent numbered document gives its number back, so the next
     * document reuses it instead of leaving a gap.
     */
    public static function releaseNumber(string $option, ?int $number, int $companyId): void
    {
        if ($number && (int) self::get($option, $companyId) === $number + 1) {
            self::set($option, (string) $number, $companyId);
        }
    }

    /**
     * The company name from Setup, or the company's name in HRMS when it was left empty.
     */
    public static function companyName(int $companyId): string
    {
        return self::get('company_name', $companyId) ?: (string) Company::find($companyId)?->company_name;
    }

    /**
     * A setting stored encrypted (API tokens, secrets); '' when unset or unreadable.
     */
    public static function secret(string $name, int $companyId): string
    {
        $stored = self::get($name, $companyId);
        if ($stored === '') {
            return '';
        }
        try {
            return Crypt::decryptString($stored);
        } catch (Throwable) {
            return '';
        }
    }

    public static function setSecret(string $name, string $plain, int $companyId): void
    {
        self::set($name, $plain === '' ? '' : Crypt::encryptString($plain), $companyId);
    }

    public static function set(string $name, ?string $value, ?int $companyId = null): void
    {
        $companyId ??= (int) CurrentCompany::id();
        Option::withoutGlobalScopes()->updateOrCreate(['company_id' => $companyId, 'name' => $name], ['value' => $value]);
        unset(self::$cache[$companyId]);
    }

    /**
     * Take the next number for a document type and move the counter on (e.g. "next_invoice_number").
     */
    public static function takeNextNumber(string $option, ?int $companyId = null): int
    {
        $number = max(1, (int) self::get($option, $companyId));
        self::set($option, (string) ($number + 1), $companyId);

        return $number;
    }

    /**
     * Perfex sales_number_format: 1 = number, 2 = year/number, 3 = number-yy, 4 = number/mm/yyyy.
     */
    public static function formatNumber(int $number, int $format, string $prefix, CarbonInterface|string|null $date, ?int $companyId = null): string
    {
        $padded = str_pad((string) $number, max(1, (int) self::get('number_padding_prefixes', $companyId)), '0', STR_PAD_LEFT);
        $date = Carbon::parse($date ?? now());

        return match ($format) {
            2 => $prefix.$date->format('Y').'/'.$padded,
            3 => $prefix.$padded.'-'.$date->format('y'),
            4 => $prefix.$padded.'/'.$date->format('m').'/'.$date->format('Y'),
            default => $prefix.$padded,
        };
    }

    public static function flush(): void
    {
        self::$cache = [];
    }
}
