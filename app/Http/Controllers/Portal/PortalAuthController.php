<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Contact;
use App\Models\ContactToken;
use App\Services\Emails;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

/**
 * Customers area login (Perfex client login): e-mail + password of a contact, forgot / set
 * password by e-mailed link, logout.
 */
class PortalAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);

        // The same e-mail can be a contact of customers in different companies: try each.
        $contact = Contact::where('email', strtolower($data['email']))->whereNotNull('password')->get()
            ->first(fn (Contact $c) => Hash::check($data['password'], $c->password));

        if (! $contact) {
            return response()->json(['message' => 'Invalid e-mail or password.'], 422);
        }
        if (! $contact->active || ! $contact->customer?->is_active || Company::find($contact->customer->company_id)?->status !== 'active') {
            return response()->json(['message' => 'Your account is not active. Please contact us.'], 422);
        }

        $contact->forceFill(['last_login_at' => now()])->save();

        return response()->json(['data' => ['token' => ContactToken::issue($contact), 'contact' => $this->present($contact)]]);
    }

    /**
     * The name and logo for a company's customers-area login page (/portal/login?company=slug).
     */
    public function branding(Request $request): JsonResponse
    {
        $company = Company::findByPortalSlug($request->query('company'));
        abort_unless($company, 404);

        return response()->json(['data' => $this->brand($company)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->present($request->attributes->get('contact'))]);
    }

    public function logout(Request $request): JsonResponse
    {
        ContactToken::where('token', hash('sha256', (string) $request->bearerToken()))->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    /**
     * "Forgot password": always the same answer (no hint whether the e-mail exists).
     */
    public function forgot(Request $request): JsonResponse
    {
        $email = strtolower($request->validate(['email' => ['required', 'email']])['email']);
        foreach (Contact::where('email', $email)->where('active', true)->with('customer')->get() as $contact) {
            self::sendPasswordLink($contact, 'contact-forgot-password');
        }

        return response()->json(['message' => 'If this e-mail belongs to an account, a link to set a new password has been sent.']);
    }

    /**
     * Set a new password from an e-mailed link (forgot password or the staff's "set password" invite).
     */
    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        $row = DB::table('contact_password_resets')->where('token', hash('sha256', $data['token']))->where('expires_at', '>', now())->first();
        if (! $row) {
            return response()->json(['message' => 'This link has expired. Please ask for a new one.'], 422);
        }

        $contact = Contact::findOrFail($row->contact_id);
        $contact->update(['password' => $data['password'], 'last_password_change_at' => now()]);
        DB::table('contact_password_resets')->where('contact_id', $contact->id)->delete();
        ContactToken::where('contact_id', $contact->id)->delete();
        Emails::send('contact-password-reseted', (int) $contact->customer->company_id, (string) $contact->email, [...Emails::contact($contact), ...Emails::customer($contact->customer)]);

        return response()->json(['message' => 'Your password has been set. You can log in now.']);
    }

    /**
     * E-mail a contact a link to set their password (valid 48 hours).
     */
    public static function sendPasswordLink(Contact $contact, string $template): void
    {
        $plain = Str::random(48);
        DB::table('contact_password_resets')->insert(['contact_id' => $contact->id, 'token' => hash('sha256', $plain), 'expires_at' => now()->addHours(48), 'created_at' => now()]);
        $slug = Company::find($contact->customer->company_id)?->portalSlug();
        $url = Emails::url('/portal/set-password/'.$plain.($slug ? '?company='.urlencode($slug) : ''));

        Emails::send($template, (int) $contact->customer->company_id, (string) $contact->email, [
            ...Emails::contact($contact),
            ...Emails::customer($contact->customer),
            'reset_password_url' => $url,
            'set_password_url' => $url,
        ], ['force' => true]);
    }

    /**
     * @return array{name: string, logo_url: string|null, slug: string}
     */
    private function brand(Company $company): array
    {
        return ['name' => Options::companyName($company->id), 'logo_url' => $company->logoUrl(), 'slug' => $company->portalSlug()];
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Contact $contact): array
    {
        $company = (int) $contact->customer->company_id;

        return [
            'id' => $contact->id,
            'first_name' => $contact->first_name,
            'last_name' => $contact->last_name,
            'email' => $contact->email,
            'phone' => $contact->phone,
            'title' => $contact->title,
            'is_primary' => $contact->is_primary,
            'customer' => ['id' => $contact->customer->id, 'name' => $contact->customer->name],
            'company_name' => Options::companyName($company),
            'company' => ($model = Company::find($company)) ? $this->brand($model) : null,
            'chat_enabled' => Options::get('chat_clients_enabled', $company) === '1',
            'knowledge_base_enabled' => Options::get('use_knowledge_base', $company) === '1',
            'can_close_tickets' => Options::get('allow_customer_to_change_ticket_status', $company) === '1',
            'can_edit_company' => $contact->is_primary && Options::get('allow_primary_contact_to_view_edit_billing_and_shipping', $company) === '1',
            'permissions' => collect(Contact::PORTAL_PERMISSIONS)->filter(fn ($p) => $contact->canPortal($p))->values(),
        ];
    }
}
