<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Portal\PortalAuthController;
use App\Models\Contact;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * A customer's contacts. One contact is primary; marking another primary moves it.
 */
class ContactController extends Controller
{
    public function store(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('update', $customer);
        $data = $this->validated($request);

        $contact = DB::transaction(function () use ($customer, $data) {
            $data['is_primary'] = ($data['is_primary'] ?? false) || ! $customer->contacts()->exists();
            if ($data['is_primary']) {
                $customer->contacts()->update(['is_primary' => false]);
            }

            return $customer->contacts()->create($data);
        });

        return response()->json(['data' => $contact], 201);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        $this->authorize('update', $contact->customer);
        $data = $this->validated($request);

        DB::transaction(function () use ($contact, $data) {
            if (! empty($data['is_primary'])) {
                $contact->customer->contacts()->whereKeyNot($contact->id)->update(['is_primary' => false]);
            } elseif ($contact->is_primary) {
                // The primary contact stays primary until another one is chosen.
                $data['is_primary'] = true;
            }
            $contact->update($data);
        });

        return response()->json(['data' => $contact]);
    }

    public function destroy(Contact $contact): JsonResponse
    {
        $this->authorize('update', $contact->customer);

        if ($contact->is_primary && $contact->customer->contacts()->count() > 1) {
            return response()->json(['message' => 'Make another contact primary before deleting this one.'], 422);
        }
        $contact->delete();

        return response()->json(['message' => 'Contact deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:191'],
            'last_name' => ['nullable', 'string', 'max:191'],
            'email' => ['required', 'email', 'max:191'],
            'phone' => ['nullable', 'string', 'max:100'],
            'title' => ['nullable', 'string', 'max:200'],
            'is_primary' => ['boolean'],
            'active' => ['boolean'],
            'invoice_emails' => ['boolean'],
            'estimate_emails' => ['boolean'],
            'credit_note_emails' => ['boolean'],
            'contract_emails' => ['boolean'],
            'task_emails' => ['boolean'],
            'project_emails' => ['boolean'],
            'ticket_emails' => ['boolean'],
            'password' => ['nullable', 'string', 'min:8', 'max:191'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => [Rule::in(Contact::PORTAL_PERMISSIONS)],
        ]);
        // An empty password field keeps the current password.
        if (empty($data['password'])) {
            unset($data['password']);
        } else {
            $data['last_password_change_at'] = now();
        }

        return $data;
    }

    /**
     * Perfex "Send set password email": the contact gets a link to choose their portal password.
     */
    public function sendPasswordEmail(Contact $contact): JsonResponse
    {
        $this->authorize('update', $contact->customer);
        abort_unless($contact->active, 422, 'The contact is not active.');
        PortalAuthController::sendPasswordLink($contact, 'contact-set-password');

        return response()->json(['message' => "A link to set the password was e-mailed to {$contact->email}."]);
    }
}
