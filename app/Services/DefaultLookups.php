<?php

namespace App\Services;

use App\Models\EstimateRequestStatus;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\TicketPriority;
use App\Models\TicketStatus;
use App\Support\CurrentCompany;

/**
 * Lists a company starts with, created the first time they are needed: GIC's lead statuses and
 * sources, and Perfex's ticket statuses and priorities.
 */
class DefaultLookups
{
    /** @var array<int, array{name: string, status_order: int, color: string, is_default?: bool}> */
    private const LEAD_STATUSES = [
        ['name' => 'New Lead', 'status_order' => 0, 'color' => '#0a11fa'],
        ['name' => 'Profile Sent', 'status_order' => 3, 'color' => '#757575'],
        ['name' => 'Meetings in Progress', 'status_order' => 3, 'color' => '#da23e8'],
        ['name' => 'Proposal Sent', 'status_order' => 4, 'color' => '#34a4af'],
        ['name' => 'Future Prospect', 'status_order' => 4, 'color' => '#d4ac14'],
        ['name' => 'Demo Done', 'status_order' => 4, 'color' => '#9eebb4'],
        ['name' => 'Customer', 'status_order' => 5, 'color' => '#19f03e', 'is_default' => true],
        ['name' => 'Dead Lead', 'status_order' => 6, 'color' => '#ed1556'],
    ];

    private const LEAD_SOURCES = ['Google', 'Facebook', 'Just Dial', 'References', 'Inhouse Minning', 'Event Participation', 'GIC Website',
        'Newspaper', 'Inbound Call', 'Linkedin', 'Corrugated', 'Event'];

    /** @var array<int, array{name: string, color: string, status_order: int, system_key: string}> */
    private const TICKET_STATUSES = [
        ['name' => 'Open', 'color' => '#ff2d42', 'status_order' => 1, 'system_key' => 'open'],
        ['name' => 'In progress', 'color' => '#84c529', 'status_order' => 2, 'system_key' => 'in_progress'],
        ['name' => 'Answered', 'color' => '#0000ff', 'status_order' => 3, 'system_key' => 'answered'],
        ['name' => 'On Hold', 'color' => '#c0c0c0', 'status_order' => 4, 'system_key' => 'on_hold'],
        ['name' => 'Closed', 'color' => '#03a9f4', 'status_order' => 5, 'system_key' => 'closed'],
    ];

    public static function ensureLeadLists(): void
    {
        if (! LeadStatus::exists()) {
            foreach (self::LEAD_STATUSES as $status) {
                LeadStatus::create($status);
            }
        }
        if (! LeadSource::exists()) {
            foreach (self::LEAD_SOURCES as $name) {
                LeadSource::create(['name' => $name]);
            }
        }
    }

    public static function ensureTicketLists(): void
    {
        if (! TicketStatus::exists()) {
            foreach (self::TICKET_STATUSES as $status) {
                TicketStatus::create($status);
            }
        }
        if (! TicketPriority::exists()) {
            foreach (['Low', 'Medium', 'High'] as $name) {
                TicketPriority::create(['name' => $name]);
            }
        }
    }

    public static function ticketStatus(string $key): TicketStatus
    {
        self::ensureTicketLists();

        return TicketStatus::where('system_key', $key)->first() ?? TicketStatus::orderBy('status_order')->firstOrFail();
    }

    /**
     * The status a converted lead gets (Perfex "default" lead status, "Customer").
     */
    public static function customerLeadStatus(): LeadStatus
    {
        self::ensureLeadLists();

        return LeadStatus::where('is_default', true)->first() ?? LeadStatus::orderByDesc('status_order')->firstOrFail();
    }

    /**
     * @param  int|null  $companyId  given when nobody is signed in (public web form)
     */
    public static function ensureEstimateRequestStatuses(?int $companyId = null): void
    {
        $companyId ??= CurrentCompany::id();
        if (! EstimateRequestStatus::withoutGlobalScopes()->where('company_id', $companyId)->exists()) {
            foreach ([['Cancelled', '#808080', 'cancelled'], ['Processing', '#007bff', 'processing'], ['Completed', '#28a745', 'completed']] as $i => [$name, $color, $flag]) {
                EstimateRequestStatus::create(['company_id' => $companyId, 'name' => $name, 'status_order' => $i + 1, 'color' => $color, 'flag' => $flag]);
            }
        }
    }

    public static function estimateRequestStatus(string $flag): EstimateRequestStatus
    {
        self::ensureEstimateRequestStatuses();

        return EstimateRequestStatus::where('flag', $flag)->first() ?? EstimateRequestStatus::orderBy('status_order')->firstOrFail();
    }
}
