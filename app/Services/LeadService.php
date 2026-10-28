<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Leads as Perfex handles them: an activity log of every change, assignment notifications,
 * lost / junk flags, and conversion into a customer with its primary contact.
 */
class LeadService
{
    private const FIELDS = [
        'name', 'title', 'company', 'description', 'email', 'phone', 'website', 'address', 'city', 'state', 'zip', 'country',
        'lead_status_id', 'lead_source_id', 'assigned_id', 'lead_value', 'is_public', 'last_contact_at',
    ];

    public function __construct(private Notifier $notifier) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Lead
    {
        return DB::transaction(function () use ($data) {
            $lead = Lead::create([
                ...Arr::only($data, self::FIELDS),
                'assigned_at' => ! empty($data['assigned_id']) ? today() : null,
                'last_status_change_at' => now(),
                'created_by' => Auth::id(),
            ]);
            $lead->syncTagNames($data['tags'] ?? []);
            $lead->logActivity('Created lead');
            $this->notifyAssigned($lead);

            return $lead;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Lead $lead, array $data): Lead
    {
        return DB::transaction(function () use ($lead, $data) {
            $fields = Arr::only($data, self::FIELDS);
            $oldStatus = $lead->lead_status_id;
            $oldAssigned = $lead->assigned_id;

            if (array_key_exists('assigned_id', $fields) && (int) $fields['assigned_id'] !== (int) $oldAssigned) {
                $fields['assigned_at'] = $fields['assigned_id'] ? today() : null;
            }
            $lead->update($fields);
            if (array_key_exists('tags', $data)) {
                $lead->syncTagNames($data['tags'] ?? []);
            }

            if ((int) $lead->lead_status_id !== (int) $oldStatus) {
                $this->logStatusChange($lead, $oldStatus);
            }
            if ((int) $lead->assigned_id !== (int) $oldAssigned) {
                $lead->logActivity('Assigned to '.($lead->assigned?->full_name ?? 'nobody'));
                $this->notifyAssigned($lead);
            }
            $lead->logActivity('Updated lead');

            return $lead;
        });
    }

    /**
     * Kanban drop: new status and the order of the cards in that column.
     *
     * @param  array<int, int>  $order
     */
    public function moveToStatus(LeadStatus $status, array $order, User $user): void
    {
        foreach (array_values($order) as $position => $id) {
            $lead = Lead::visibleTo($user)->find($id);
            if (! $lead) {
                continue;
            }
            $old = $lead->lead_status_id;
            $lead->update(['lead_status_id' => $status->id, 'lead_order' => $position + 1]);
            if ((int) $old !== (int) $status->id) {
                $this->logStatusChange($lead, $old);
            }
        }
    }

    public function setFlag(Lead $lead, string $flag, bool $on): void
    {
        $lead->update([$flag => $on]);
        $lead->logActivity(($on ? 'Marked as ' : 'Unmarked as ').$flag);
    }

    /**
     * Perfex convert to customer: the customer (with the lead's details), its primary contact, the
     * lead's proposals moved over, and the lead set to the "Customer" status.
     *
     * @param  array{name?: string|null, contact_first_name: string, contact_last_name?: string|null, email: string, phone?: string|null, title?: string|null}  $data
     */
    public function convertToCustomer(Lead $lead, array $data): Customer
    {
        if ($lead->customer_id) {
            throw ValidationException::withMessages(['lead' => 'This lead is already a customer.']);
        }

        return DB::transaction(function () use ($lead, $data) {
            $customer = Customer::create([
                'name' => ($data['name'] ?? null) ?: ($lead->company ?: $lead->name),
                'phone' => $lead->phone,
                'website' => $lead->website,
                'address' => $lead->address,
                'city' => $lead->city,
                'state' => $lead->state,
                'zip' => $lead->zip,
                'country' => $lead->country,
                'billing_street' => $lead->address,
                'billing_city' => $lead->city,
                'billing_state' => $lead->state,
                'billing_zip' => $lead->zip,
                'billing_country' => $lead->country,
                'is_active' => true,
                'created_by' => Auth::id(),
            ]);
            $customer->contacts()->create([
                'is_primary' => true,
                'first_name' => $data['contact_first_name'],
                'last_name' => $data['contact_last_name'] ?? null,
                'email' => $data['email'],
                'phone' => $data['phone'] ?? $lead->phone,
                'title' => $data['title'] ?? $lead->title,
            ]);

            // Settings → Leads: the lead's assigned staff member looks after the new customer.
            if ($lead->assigned_id && Options::get('auto_assign_customer_admin_after_lead_convert') === '1') {
                $customer->admins()->create(['user_id' => $lead->assigned_id]);
            }
            $lead->proposals()->update(['customer_id' => $customer->id]);
            $lead->update([
                'customer_id' => $customer->id,
                'converted_at' => now(),
                'lead_status_id' => DefaultLookups::customerLeadStatus()->id,
                'lost' => false,
                'junk' => false,
            ]);
            $lead->logActivity('Converted to customer');

            return $customer;
        });
    }

    /**
     * A note; "contacted" also moves the lead's last contact date.
     */
    public function addNote(Lead $lead, string $description, ?string $contactedAt): void
    {
        $lead->notes()->create(['description' => $description, 'contacted_at' => $contactedAt, 'created_by' => Auth::id()]);
        if ($contactedAt) {
            $lead->update(['last_contact_at' => $contactedAt]);
        }
        $lead->logActivity('Added note');
    }

    private function logStatusChange(Lead $lead, ?int $oldStatusId): void
    {
        $from = LeadStatus::find($oldStatusId)?->name ?? '—';
        $lead->update(['last_status_change_at' => now()]);
        $lead->logActivity("Status changed from {$from} to {$lead->status()->value('name')}");
    }

    private function notifyAssigned(Lead $lead): void
    {
        if ($lead->assigned_id) {
            $this->notifier->notify([$lead->assigned_id], "assigned you to lead {$lead->name}", "/leads?lead={$lead->id}");
            Emails::toStaff('new-lead-assigned', (int) $lead->company_id, [$lead->assigned_id], Emails::lead($lead), $lead);
        }
    }
}
