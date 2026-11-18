<?php

namespace App\Services;

use App\Models\Company;
use App\Models\LeadPipeline;
use App\Models\Option;
use App\Support\CurrentCompany;
use App\Support\Workspace;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/**
 * Company settings (Perfex get_option / update_option), with Perfex's defaults. A workspace other
 * than the default one has the settings it changed of its own and follows the default one's for
 * the rest; the company's details (COMMON) are the same everywhere.
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
        'company_pan' => '',
        'company_email' => '',
        // Localization, set from the company's country at sign-up (Setup → Company Information).
        'timezone' => 'Asia/Kolkata',
        'locale' => 'en-IN',
        'tax_id_label' => 'GSTIN',
        // Setup → Menu Setup: the sidebar and Setup menus as the company arranged them (JSON; empty = default).
        'menu_setup' => '',
        'setup_menu_setup' => '',
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
        // Google reCAPTCHA v2 for web forms (the secret key is stored encrypted).
        'recaptcha_site_key' => '',
        'recaptcha_secret_key' => '',
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
        'allow_non_admin_members_to_import_leads' => '0',
        'leads_kanban_limit' => '50',
        // dateadded, leadorder or lastcontact; asc or desc.
        'default_leads_kanban_sort' => 'leadorder',
        'default_leads_kanban_sort_type' => 'asc',
        // How wide a lead opens: modal-lg, modal-xl or modal-xxl.
        'lead_modal_class' => 'modal-xl',
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
        // The approved template for status updates outside WhatsApp's 24-hour window (empty: free text only).
        'whatsapp_status_template_name' => '',
        'whatsapp_status_template_version' => '',
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
        'show_lead_follow_ups_on_calendar' => '1',
        // Setup → Leads → Status updates: when a lead's status changes (statuses ticked in Setup → Lead Statuses).
        'lead_status_notify_staff' => '1',
        'lead_status_email_lead' => '1',
        'lead_status_whatsapp_lead' => '1',
        'lead_status_whatsapp_message' => "Hello {lead_name},\n\nThank you for your interest in {companyname}. Your enquiry status has been updated to: *{lead_status}*.\n\nIf you have any questions, just reply to this message.\n\nRegards,\nTeam {companyname}",
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

    /** @var array<int, array<int, array<string, string|null>>> company => workspace (0: common) => name => value */
    private static array $cache = [];

    /** @var array<int, array<int, bool>> company => workspace id => is_default */
    private static array $workspaces = [];

    /** The workspace pinned for a job, public page or webhook (useWorkspace), instead of the header's. */
    private static ?int $pinned = null;

    private static bool $isPinned = false;

    /**
     * The company's own details, the same in every workspace (Setup → Company Information). Any
     * other setting can be a workspace's own.
     */
    public const COMMON = [
        'company_name', 'company_address', 'company_city', 'company_state', 'company_zip', 'company_country', 'company_phone',
        'company_vat', 'company_pan', 'company_email', 'timezone', 'locale', 'tax_id_label',
    ];

    /**
     * Number counters and their prefix: a workspace with a prefix of its own counts its own
     * numbers; one using the default workspace's prefix shares its counter (no number twice).
     */
    public const COUNTERS = [
        'next_invoice_number' => 'invoice_prefix',
        'next_estimate_number' => 'estimate_prefix',
        'next_credit_note_number' => 'credit_note_prefix',
        'next_pr_number' => 'pur_request_prefix',
        'next_po_number' => 'pur_order_prefix',
        'next_pur_inv_number' => 'pur_inv_prefix',
    ];

    /** Settings every staff member's screens may read (no secrets). */
    public const PUBLIC = [
        'menu_setup', 'setup_menu_setup', 'customer_default_country', 'company_country', 'timezone', 'locale', 'tax_id_label', 'default_contact_permissions', 'ticket_services_enabled', 'ticket_replies_order', 'default_ticket_reply_status',
        'maximum_allowed_ticket_attachments', 'ticket_attachments_file_extensions', 'leads_default_status', 'leads_default_source',
        'calendar_first_day', 'lead_unique_validation', 'allow_non_admin_members_to_import_leads', 'leads_kanban_limit', 'lead_modal_class', 'default_leads_kanban_sort', 'default_leads_kanban_sort_type',
    ];

    /**
     * Use this workspace's settings (for a job, public page or webhook of one of its records)
     * instead of the one open in the header. Null: the default workspace's.
     */
    public static function useWorkspace(?int $workspaceId): void
    {
        self::$pinned = $workspaceId ?: null;
        self::$isPinned = true;
    }

    /** Back to the workspace open in the header. */
    public static function releaseWorkspace(): void
    {
        self::$pinned = null;
        self::$isPinned = false;
    }

    /**
     * Run with one workspace's settings, then go back.
     *
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function within(?int $workspaceId, callable $callback): mixed
    {
        [$pinned, $isPinned] = [self::$pinned, self::$isPinned];
        self::useWorkspace($workspaceId);
        try {
            return $callback();
        } finally {
            [self::$pinned, self::$isPinned] = [$pinned, $isPinned];
        }
    }

    /**
     * The workspace whose own settings apply now, or null for the common ones (the default
     * workspace, a company with one workspace, or no workspace known).
     */
    public static function workspaceId(?int $companyId = null): ?int
    {
        $companyId ??= (int) CurrentCompany::id();
        if (self::$isPinned) {
            $id = self::$pinned;
        } else {
            $open = Workspace::filter();
            $id = $open && (int) $open->company_id === $companyId ? (int) $open->id : null;
        }
        if (! $id) {
            return null;
        }
        self::$workspaces[$companyId] ??= LeadPipeline::withoutGlobalScopes()->where('company_id', $companyId)->pluck('is_default', 'id')->map(fn ($d) => (bool) $d)->all();

        return (self::$workspaces[$companyId][$id] ?? null) === false ? $id : null;
    }

    /** The workspace a setting is read from / saved for now: null for the common value. */
    private static function scopeFor(string $name, int $companyId): ?int
    {
        if (in_array($name, self::COMMON, true)) {
            return null;
        }
        $workspace = self::workspaceId($companyId);
        if ($workspace && isset(self::COUNTERS[$name]) && ! array_key_exists(self::COUNTERS[$name], self::rows($companyId)[$workspace] ?? [])) {
            return null;
        }

        return $workspace;
    }

    /** @return array<int, array<string, string|null>> */
    private static function rows(int $companyId): array
    {
        if (! isset(self::$cache[$companyId])) {
            $rows = [];
            foreach (Option::withoutGlobalScopes()->where('company_id', $companyId)->get(['workspace_id', 'name', 'value']) as $row) {
                $rows[(int) $row->workspace_id][$row->name] = $row->value;
            }
            self::$cache[$companyId] = $rows;
        }

        return self::$cache[$companyId];
    }

    public static function get(string $name, ?int $companyId = null): string
    {
        $companyId ??= (int) CurrentCompany::id();
        $workspace = self::scopeFor($name, $companyId);
        if ($workspace) {
            $own = self::rows($companyId)[$workspace] ?? [];
            if (array_key_exists($name, $own)) {
                return (string) $own[$name];
            }
            // A workspace's own counter starts at 1.
            if (isset(self::COUNTERS[$name])) {
                return self::DEFAULTS[$name];
            }
        }

        return self::common($name, $companyId);
    }

    /** The default workspace's (common) value of a setting. */
    public static function common(string $name, ?int $companyId = null): string
    {
        $companyId ??= (int) CurrentCompany::id();

        return (string) (self::rows($companyId)[0][$name] ?? self::DEFAULTS[$name] ?? '');
    }

    /**
     * The settings the open workspace has of its own (changed from the default workspace's).
     *
     * @return array<int, string>
     */
    public static function ownNames(?int $companyId = null): array
    {
        $companyId ??= (int) CurrentCompany::id();
        $workspace = self::workspaceId($companyId);

        return $workspace ? array_keys(self::rows($companyId)[$workspace] ?? []) : [];
    }

    /**
     * Another workspace numbering with this prefix of its own (two workspaces with one prefix
     * would give the same number twice), or null.
     */
    public static function prefixTakenBy(string $prefixName, string $value, ?int $companyId = null): ?int
    {
        $companyId ??= (int) CurrentCompany::id();
        $mine = (int) self::workspaceId($companyId);
        foreach (self::rows($companyId) as $id => $values) {
            if ($id !== 0 && $id !== $mine && isset($values[$prefixName]) && trim((string) $values[$prefixName]) === trim($value)) {
                return $id;
            }
        }

        return null;
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
        return self::decrypt(self::get($name, $companyId));
    }

    public static function setSecret(string $name, string $plain, int $companyId): void
    {
        $workspace = self::scopeFor($name, $companyId);
        if ($workspace && $plain !== '' && $plain === self::decrypt(self::common($name, $companyId))) {
            self::forget($name, $companyId);

            return;
        }
        self::set($name, $plain === '' ? '' : Crypt::encryptString($plain), $companyId);
    }

    /**
     * Save a setting: for the open workspace when it isn't the default one (the same value as
     * the default workspace's just follows that one), else the common value.
     */
    public static function set(string $name, ?string $value, ?int $companyId = null): void
    {
        $companyId ??= (int) CurrentCompany::id();
        $workspace = self::scopeFor($name, $companyId);
        if ($workspace && ! isset(self::COUNTERS[$name]) && (string) $value === self::common($name, $companyId)) {
            self::forget($name, $companyId);

            return;
        }
        Option::withoutGlobalScopes()->updateOrCreate(['company_id' => $companyId, 'workspace_id' => $workspace, 'name' => $name], ['value' => $value]);
        unset(self::$cache[$companyId]);
    }

    /** The open workspace follows the default workspace's value of this setting again. */
    public static function forget(string $name, ?int $companyId = null): void
    {
        $companyId ??= (int) CurrentCompany::id();
        if ($workspace = self::workspaceId($companyId)) {
            Option::withoutGlobalScopes()->where('company_id', $companyId)->where('workspace_id', $workspace)->where('name', $name)->delete();
            unset(self::$cache[$companyId]);
        }
    }

    private static function decrypt(string $stored): string
    {
        try {
            return $stored === '' ? '' : Crypt::decryptString($stored);
        } catch (Throwable) {
            return '';
        }
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

    /**
     * The workspace whose settings a job dispatched now should use (queued jobs carry it).
     */
    public static function forJob(): ?int
    {
        if (self::$isPinned) {
            return self::$pinned;
        }
        $company = CurrentCompany::id();

        return $company ? self::workspaceId($company) : null;
    }

    /** @return array{0: ?int, 1: bool} */
    public static function state(): array
    {
        return [self::$pinned, self::$isPinned];
    }

    /** @param  array{0: ?int, 1: bool}  $state */
    public static function restore(array $state): void
    {
        [self::$pinned, self::$isPinned] = $state;
    }

    /** Workspaces were added, removed or a new default picked. */
    public static function forgetWorkspaces(): void
    {
        self::$workspaces = [];
    }

    public static function flush(): void
    {
        self::$cache = [];
        self::$workspaces = [];
        self::releaseWorkspace();
    }
}
