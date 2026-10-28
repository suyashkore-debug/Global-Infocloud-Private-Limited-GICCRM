<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\Customer;
use App\Models\Ticket;
use App\Models\TicketReply;
use App\Models\TicketStatus;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Support tickets as Perfex handles them: opened for a contact (or any name / email), replies
 * that move the status (staff reply → Answered), assignment and department notifications.
 */
class TicketService
{
    private const FIELDS = [
        'subject', 'message', 'customer_id', 'contact_id', 'name', 'email', 'cc', 'support_department_id',
        'ticket_priority_id', 'ticket_service_id', 'project_id', 'assigned_id',
    ];

    public function __construct(private Notifier $notifier) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function open(array $data, bool $byCustomer = false): Ticket
    {
        return DB::transaction(function () use ($data, $byCustomer) {
            $fields = Arr::only($data, self::FIELDS);
            if (! empty($fields['contact_id'])) {
                $contact = Contact::findOrFail($fields['contact_id']);
                $fields['customer_id'] = $contact->customer_id;
                $fields['name'] = $contact->fullName();
                $fields['email'] = $contact->email;
            }

            $ticket = Ticket::create([
                ...$fields,
                'ticket_status_id' => DefaultLookups::ticketStatus('open')->id,
                'ticket_key' => Str::random(32),
                'last_reply_at' => null,
                'created_by' => Auth::id(),
            ]);
            $ticket->syncTagNames($data['tags'] ?? []);

            $this->notifyStaff($ticket, "opened ticket #{$ticket->id} {$ticket->subject}");
            // Perfex: the customer gets "New Support Ticket Opened" when staff open a ticket for them,
            // and the auto-response when they open it themselves in the customers area.
            DB::afterCommit(fn () => $this->emailCustomer($ticket, $byCustomer ? 'ticket-autoresponse' : 'new-ticket-opened-admin'));

            return $ticket;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Ticket $ticket, array $data): Ticket
    {
        $oldAssigned = $ticket->assigned_id;
        $ticket->update(Arr::only($data, [...self::FIELDS, 'ticket_status_id']));
        if (array_key_exists('tags', $data)) {
            $ticket->syncTagNames($data['tags'] ?? []);
        }
        if ($ticket->assigned_id && (int) $ticket->assigned_id !== (int) $oldAssigned) {
            $this->notifier->notify([$ticket->assigned_id], "assigned you to ticket #{$ticket->id} {$ticket->subject}", $this->link($ticket));
            Emails::toStaff('ticket-assigned-to-admin', (int) $ticket->company_id, [$ticket->assigned_id], Emails::ticket($ticket), $ticket);
        }

        return $ticket;
    }

    /**
     * A staff reply; the ticket takes the chosen status (Perfex default: Answered).
     */
    public function reply(Ticket $ticket, string $message, ?TicketStatus $status = null): TicketReply
    {
        return DB::transaction(function () use ($ticket, $message, $status) {
            $reply = $ticket->replies()->create(['user_id' => Auth::id(), 'message' => $message]);
            $ticket->update([
                'ticket_status_id' => ($status ?? self::defaultReplyStatus())->id,
                'last_reply_at' => now(),
            ]);
            // Settings → Support: the first staff member to answer an unassigned ticket takes it.
            if (! $ticket->assigned_id && Options::get('automatically_assign_ticket_to_first_staff_responding') === '1') {
                $ticket->update(['assigned_id' => Auth::id()]);
            }
            if ($ticket->assigned_id) {
                $this->notifier->notify([$ticket->assigned_id], "replied to ticket #{$ticket->id} {$ticket->subject}", $this->link($ticket));
            }
            DB::afterCommit(fn () => $this->emailCustomer($ticket, 'ticket-reply', $message));

            return $reply;
        });
    }

    /**
     * A reply from the customer (customers area): the ticket is open again and the assigned
     * staff member (or the department) is told.
     */
    public function customerReply(Ticket $ticket, Contact $contact, string $message): TicketReply
    {
        return DB::transaction(function () use ($ticket, $contact, $message) {
            $reply = $ticket->replies()->create(['contact_id' => $contact->id, 'name' => $contact->fullName(), 'email' => $contact->email, 'message' => $message]);
            $ticket->update(['ticket_status_id' => DefaultLookups::ticketStatus('open')->id, 'last_reply_at' => now(), 'admin_read' => false]);

            $userIds = $ticket->assigned_id ? [$ticket->assigned_id]
                : (Options::get('receive_notification_on_new_ticket_replies', (int) $ticket->company_id) === '1' ? $ticket->department?->memberIds() ?? [] : []);
            $this->notifier->notify($userIds, "{$contact->fullName()} replied to ticket #{$ticket->id} {$ticket->subject}", $this->link($ticket), (int) $ticket->company_id);
            Emails::toStaff('ticket-reply-to-admin', (int) $ticket->company_id, $userIds, Emails::ticket($ticket, $message), $ticket);

            return $reply;
        });
    }

    /**
     * Settings → Support "Default status selected when replying" (Perfex default: Answered).
     */
    public static function defaultReplyStatus(): TicketStatus
    {
        $id = (int) Options::get('default_ticket_reply_status');

        return ($id ? TicketStatus::find($id) : null) ?? DefaultLookups::ticketStatus('answered');
    }

    /**
     * Settings → Support: how many files a ticket reply takes and which kinds.
     *
     * @return array<string, array<int, string>>
     */
    public static function attachmentRules(): array
    {
        $extensions = collect(explode(',', Options::get('ticket_attachments_file_extensions')))->map(fn ($e) => ltrim(strtolower(trim($e)), '.'))->filter()->implode(',');

        return [
            'files' => ['nullable', 'array', 'max:'.max(1, (int) Options::get('maximum_allowed_ticket_attachments'))],
            'files.*' => ['file', 'max:20480', ...($extensions !== '' ? ['extensions:'.$extensions] : [])],
        ];
    }

    public function changeStatus(Ticket $ticket, TicketStatus $status): void
    {
        $ticket->update(['ticket_status_id' => $status->id]);
    }

    /**
     * Assigned staff, or the department's members, hear about a new ticket.
     */
    private function notifyStaff(Ticket $ticket, string $description): void
    {
        $userIds = $ticket->assigned_id ? [$ticket->assigned_id]
            : (Options::get('receive_notification_on_new_ticket', (int) $ticket->company_id) === '1' ? $ticket->department?->memberIds() ?? [] : []);
        if ($userIds === []) {
            return;
        }
        $this->notifier->notify($userIds, $description, $this->link($ticket));
        Emails::toStaff($ticket->assigned_id ? 'ticket-assigned-to-admin' : 'new-ticket-created-staff', (int) $ticket->company_id, $userIds, Emails::ticket($ticket), $ticket);
    }

    /**
     * E-mail the person who raised the ticket (and its CC), if they want ticket e-mails.
     */
    private function emailCustomer(Ticket $ticket, string $template, ?string $message = null): void
    {
        $contact = $ticket->contact_id ? Contact::find($ticket->contact_id) : null;
        if (! $ticket->email || ($contact && ! $contact->ticket_emails)) {
            return;
        }
        $cc = array_values(array_filter(array_map('trim', explode(',', (string) $ticket->cc))));

        Emails::send($template, (int) $ticket->company_id, $ticket->email, [
            ...Emails::ticket($ticket->loadMissing(['priority', 'department', 'status']), $message),
            ...Emails::contact($contact),
            ...Emails::customer($ticket->customer_id ? Customer::find($ticket->customer_id) : null),
            'contact_firstname' => $contact?->first_name ?? $ticket->name,
            'contact_email' => $ticket->email,
        ], ['cc' => $cc, 'rel' => $ticket]);
    }

    private function link(Ticket $ticket): string
    {
        return "/tickets/{$ticket->id}";
    }
}
