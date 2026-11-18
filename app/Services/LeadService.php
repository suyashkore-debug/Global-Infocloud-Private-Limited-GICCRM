<?php

namespace App\Services;

use App\Http\Controllers\Portal\PortalAuthController;
use App\Models\Customer;
use App\Models\CustomField;
use App\Models\CustomFieldValue;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\Note;
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
        'name', 'first_name', 'last_name', 'title', 'company', 'description', 'email', 'phone', 'website', 'address', 'city', 'state', 'zip', 'country', 'default_language',
        'lead_status_id', 'lead_source_id', 'assigned_id', 'lead_value', 'is_public', 'last_contact_at', 'next_follow_up_at', 'follow_up_note',
    ];

    public function __construct(private Notifier $notifier, private LeadStatusMessages $statusMessages) {}

    /**
     * Set, move or finish a lead's follow-up. Finishing it counts as contact (Last Contact = now)
     * and can set the next one at once.
     *
     * @param  array{next_follow_up_at?: ?string, follow_up_note?: ?string, done?: bool, outcome?: ?string}  $data
     */
    public function followUp(Lead $lead, array $data): Lead
    {
        return DB::transaction(function () use ($lead, $data) {
            if (! empty($data['done'])) {
                $lead->logActivity('Follow-up done'.(! empty($data['outcome']) ? ': '.$data['outcome'] : ''));
                $lead->last_contact_at = now();
            }
            $next = $data['next_follow_up_at'] ?? null;
            $lead->fill([
                'next_follow_up_at' => $next,
                'follow_up_note' => $next ? ($data['follow_up_note'] ?? null) : null,
                'follow_up_by' => $next ? Auth::id() : null,
            ])->save();

            return $lead;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Lead
    {
        return DB::transaction(function () use ($data) {
            $lead = Lead::create([
                ...Arr::only($data, self::FIELDS),
                'follow_up_by' => ! empty($data['next_follow_up_at']) ? Auth::id() : null,
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
            if (array_key_exists('next_follow_up_at', $fields) && (string) $fields['next_follow_up_at'] !== (string) $lead->next_follow_up_at) {
                $fields['follow_up_by'] = $fields['next_follow_up_at'] ? Auth::id() : null;
            }
            // Field changes are logged by the lead itself (LeadChangeLog).
            $lead->update($fields);
            if (array_key_exists('tags', $data)) {
                $this->syncTagsLogged($lead, $data['tags'] ?? []);
            }

            if ((int) $lead->lead_status_id !== (int) $oldStatus) {
                $this->touchStatusChange($lead);
                $this->statusMessages->changed($lead, Auth::user(), $oldStatus ? (int) $oldStatus : null);
            }
            if ((int) $lead->assigned_id !== (int) $oldAssigned) {
                $this->notifyAssigned($lead);
            }

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
                $this->touchStatusChange($lead);
                $this->statusMessages->changed($lead, $user, $old ? (int) $old : null);
            }
        }
    }

    public function setFlag(Lead $lead, string $flag, bool $on): void
    {
        // A lost or junk lead needs no more follow-ups.
        $lead->update([$flag => $on, ...($on ? ['next_follow_up_at' => null, 'follow_up_note' => null] : [])]);
    }

    /**
     * Perfex convert to customer: the customer (with the lead's details), its primary contact, the
     * lead's proposals moved over, and the lead set to the "Customer" status.
     *
     * Perfex's options: a portal password for the contact or a "set password" e-mail, the lead's notes
     * moved to the customer, and the lead's custom field values copied to the customer's custom fields
     * with the same name.
     *
     * @param  array{name?: string|null, contact_first_name: string, contact_last_name?: string|null, email: string, phone?: string|null, title?: string|null, password?: string|null, send_set_password_email?: bool, transfer_notes?: bool, copy_custom_fields?: bool}  $data
     */
    public function convertToCustomer(Lead $lead, array $data): Customer
    {
        if ($lead->customer_id) {
            throw ValidationException::withMessages(['lead' => 'This lead is already a customer.']);
        }

        $customer = DB::transaction(function () use ($lead, $data) {
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
                ...(! empty($data['password']) ? ['password' => $data['password'], 'last_password_change_at' => now()] : []),
            ]);

            if (! empty($data['transfer_notes'])) {
                Note::where('notable_type', Lead::class)->where('notable_id', $lead->id)->update(['notable_type' => Customer::class, 'notable_id' => $customer->id]);
            }
            if (! empty($data['copy_custom_fields'])) {
                $this->copyCustomFields($lead, $customer);
            }

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

        $contact = $customer->contacts()->where('is_primary', true)->first();
        if (! empty($data['send_set_password_email']) && empty($data['password']) && $contact) {
            PortalAuthController::sendPasswordLink($contact, 'contact-set-password');
        }

        return $customer;
    }

    /**
     * The lead's custom field values onto the customer's custom fields of the same name (any case).
     */
    private function copyCustomFields(Lead $lead, Customer $customer): void
    {
        $leadFields = CustomField::where('field_to', 'leads')->pluck('name', 'id');
        $customerFields = CustomField::where('field_to', 'customers')->get()->keyBy(fn (CustomField $f) => mb_strtolower(trim($f->name)));

        CustomFieldValue::whereIn('custom_field_id', $leadFields->keys())->where('rel_id', $lead->id)->get()
            ->each(function (CustomFieldValue $value) use ($leadFields, $customerFields, $customer) {
                $target = $customerFields->get(mb_strtolower(trim($leadFields[$value->custom_field_id])));
                if ($target && (string) $value->value !== '') {
                    CustomFieldValue::updateOrCreate(['custom_field_id' => $target->id, 'rel_id' => $customer->id], ['value' => $value->value]);
                }
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

    /** The status changed (logged by the lead): note when. */
    private function touchStatusChange(Lead $lead): void
    {
        $lead->update(['last_status_change_at' => now()]);
    }

    /**
     * Set the lead's tags and log what was added or removed.
     *
     * @param  array<int, string>  $names
     */
    private function syncTagsLogged(Lead $lead, array $names): void
    {
        $before = $lead->tags()->pluck('name')->all();
        $lead->syncTagNames($names);
        $after = $lead->tags()->pluck('name')->all();
        $added = array_diff($after, $before);
        $removed = array_diff($before, $after);
        if ($added || $removed) {
            $lead->logActivity('Tags changed:'.($added ? ' added '.implode(', ', $added) : '').($added && $removed ? ';' : '').($removed ? ' removed '.implode(', ', $removed) : ''));
        }
    }

    private function notifyAssigned(Lead $lead): void
    {
        if ($lead->assigned_id) {
            $this->notifier->notify([$lead->assigned_id], "assigned you to lead {$lead->name}", "/leads?lead={$lead->id}");
            Emails::toStaff('new-lead-assigned', (int) $lead->company_id, [$lead->assigned_id], Emails::lead($lead), $lead);
        }
    }
}
