<?php

use App\Enums\InvoiceStatus;
use App\Models\CalendarEvent;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Project;
use App\Models\Reminder;
use App\Models\SupportDepartment;
use App\Models\Ticket;
use App\Models\TicketReply;
use App\Services\DefaultLookups;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

it('sends the Perfex widgets only to people who may see them', function () {
    $admin = signIn(companyAdmin());
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    Invoice::factory()->for($customer)->create(['status' => InvoiceStatus::Unpaid]);
    Invoice::factory()->for($customer)->create(['status' => InvoiceStatus::Paid, 'sent' => true]);
    $project = Project::factory()->for($customer)->create(['status' => 2]);
    $project->members()->create(['user_id' => $admin->id]);
    $today = Carbon::today('Asia/Kolkata');
    Contract::create(['subject' => 'AMC', 'customer_id' => $customer->id, 'start_date' => $today->copy()->subYear(), 'end_date' => $today->copy()->addDays(2), 'hash' => Str::random(32), 'created_by' => $admin->id]);
    Contract::create(['subject' => 'Far', 'customer_id' => $customer->id, 'start_date' => $today, 'end_date' => $today->copy()->addMonths(3), 'hash' => Str::random(32), 'created_by' => $admin->id]);
    CalendarEvent::create(['title' => 'Team meet', 'start' => $today->copy()->addDay()->setTime(10, 0)->utc(), 'public' => true, 'user_id' => $admin->id]);
    Reminder::create(['remindable_type' => Customer::class, 'remindable_id' => $customer->id, 'user_id' => $admin->id, 'remind_at' => now()->addDay(), 'description' => 'Call back', 'created_by' => $admin->id]);

    $data = $this->getJson('/api/dashboard/widgets')->assertOk()->json('data');
    expect($data)->toHaveKeys(['quick_stats', 'finance_overview', 'my_projects', 'my_reminders', 'contracts_expiring', 'upcoming_events', 'project_activity', 'latest_activity'])
        ->and($data['quick_stats']['invoices_awaiting'])->toBe(['count' => 1, 'total' => 2])
        ->and($data['quick_stats']['projects_in_progress'])->toBe(['count' => 1, 'total' => 1])
        ->and($data['finance_overview']['invoices']['not_sent'])->toBe(1)
        ->and(collect($data['contracts_expiring'])->pluck('subject')->all())->toBe(['AMC'])
        ->and($data['upcoming_events']['this_week'] ?: $data['upcoming_events']['next_week'])->toHaveCount(1)
        ->and($data['my_reminders'][0])->toMatchArray(['description' => 'Call back', 'link' => "/customers/{$customer->id}"])
        ->and($data['my_projects'])->toHaveCount(1)
        ->and($data['can_tickets_report'])->toBeTrue();

    signIn(staffMember($admin->company));
    $plain = $this->getJson('/api/dashboard/widgets')->assertOk()->json('data');
    expect($plain)->not->toHaveKeys(['finance_overview', 'contracts_expiring', 'latest_activity'])
        ->and($plain['quick_stats'])->not->toHaveKey('invoices_awaiting')
        ->and($plain['my_projects'])->toBe([])
        ->and($plain['upcoming_events']['this_week'] ?: $plain['upcoming_events']['next_week'])->toHaveCount(1) // public event
        ->and($plain['can_tickets_report'])->toBeFalse();
    $this->getJson('/api/dashboard/tickets-report')->assertForbidden();
    $this->getJson('/api/dashboard/payments')->assertForbidden();
});

it('counts tickets awaiting reply per department and reports replies by staff', function () {
    $admin = signIn(companyAdmin());
    DefaultLookups::ensureTicketLists();
    $support = SupportDepartment::create(['name' => 'Support']);
    $open = DefaultLookups::ticketStatus('open')->id;
    $answered = DefaultLookups::ticketStatus('answered')->id;
    $make = fn (int $status) => Ticket::create(['subject' => 'Help', 'message' => 'x', 'name' => 'A', 'email' => 'a@x.test', 'support_department_id' => $support->id, 'ticket_status_id' => $status, 'ticket_priority_id' => \App\Models\TicketPriority::value('id'), 'assigned_id' => $admin->id, 'ticket_key' => Str::random(20), 'created_by' => $admin->id]);
    $make($open);
    $make($open);
    $replied = $make($answered);
    TicketReply::create(['ticket_id' => $replied->id, 'user_id' => $admin->id, 'message' => 'Done']);

    $data = $this->getJson('/api/dashboard/widgets')->json('data');
    expect($data['tickets_by_department'])->toBe([['name' => 'Support', 'count' => 2]]);

    $rows = $this->getJson('/api/dashboard/tickets-report?period=this_month')->assertOk()->json('data.rows');
    expect($rows[0])->toMatchArray(['user_id' => $admin->id, 'total_assigned' => 3, 'open' => 3, 'closed' => 0, 'replies' => 1]);
});

it('charts payments of this week against last week', function () {
    $admin = signIn(companyAdmin());
    $invoice = Invoice::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $monday = Carbon::today('Asia/Kolkata')->startOfWeek();
    Payment::create(['invoice_id' => $invoice->id, 'amount' => 500, 'date' => $monday->toDateString(), 'created_by' => $admin->id]);
    Payment::create(['invoice_id' => $invoice->id, 'amount' => 200, 'date' => $monday->copy()->subWeek()->addDays(2)->toDateString(), 'created_by' => $admin->id]);

    $weekly = $this->getJson('/api/dashboard/payments')->assertOk()->json('data');
    expect($weekly['series'][0]['values'][0])->toEqual(500)
        ->and($weekly['series'][1]['values'][2])->toEqual(200);

    $monthly = $this->getJson('/api/dashboard/payments?period=monthly')->json('data');
    expect($monthly['labels'])->toHaveCount(12)
        ->and(array_sum($monthly['series'][0]['values']))->toBeGreaterThanOrEqual(500);
});
