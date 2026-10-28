<?php

use App\Enums\InvoiceStatus;
use App\Mail\TemplateMail;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\Task;
use App\Models\Ticket;
use App\Services\Options;
use Illuminate\Support\Facades\Mail;

/**
 * A customer with a contact who can log in (password "secret123"); returns [admin, customer, contact].
 */
function portalSetup(): array
{
    $admin = companyAdmin();
    $customer = Customer::factory()->create(['company_id' => $admin->company_id, 'name' => 'Acme']);
    $contact = Contact::create(['customer_id' => $customer->id, 'first_name' => 'Asha', 'email' => 'asha@acme.test', 'password' => 'secret123', 'is_primary' => true, 'active' => true]);

    return [$admin, $customer, $contact];
}

function portalLogin($test, string $email = 'asha@acme.test', string $password = 'secret123'): array
{
    $token = $test->postJson('/api/portal/login', ['email' => $email, 'password' => $password])->assertOk()->json('data.token');

    return ['Authorization' => "Bearer {$token}"];
}

it('logs a contact in and out, and refuses wrong passwords and staff tokens', function () {
    [$admin] = portalSetup();
    $this->postJson('/api/portal/login', ['email' => 'asha@acme.test', 'password' => 'nope'])->assertUnprocessable();
    $headers = portalLogin($this);

    $this->getJson('/api/portal/me', $headers)->assertOk()->assertJsonPath('data.customer.name', 'Acme')->assertJsonPath('data.permissions.0', 'invoices');
    $this->postJson('/api/portal/logout', [], $headers)->assertOk();
    $this->getJson('/api/portal/me', $headers)->assertUnauthorized();

    signIn($admin);
    $this->getJson('/api/portal/me')->assertUnauthorized();
});

it('shows only the customer\'s own non-draft invoices', function () {
    [$admin, $customer] = portalSetup();
    $mine = Invoice::factory()->create(['customer_id' => $customer->id, 'total' => 500]);
    Invoice::factory()->create(['customer_id' => $customer->id, 'status' => InvoiceStatus::Draft]);
    Invoice::factory()->create(['customer_id' => Customer::factory()->create(['company_id' => $admin->company_id])->id]);
    $headers = portalLogin($this);

    $this->getJson('/api/portal/documents/invoices', $headers)->assertOk()->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $mine->id)->assertJsonPath('data.0.link', "/invoice/{$mine->id}/{$mine->hash}");
    $this->getJson('/api/portal/dashboard', $headers)->assertJsonPath('data.invoices_unpaid', 1)->assertJsonPath('data.amount_due', 500);
    $this->getJson('/api/portal/statement?from='.today()->subYear()->toDateString().'&to='.today()->toDateString(), $headers)->assertJsonPath('data.balance_due', 500);
});

it('respects the contact\'s portal permissions', function () {
    [, , $contact] = portalSetup();
    $contact->update(['permissions' => ['support']]);
    $headers = portalLogin($this);

    $this->getJson('/api/portal/documents/invoices', $headers)->assertForbidden();
    $this->getJson('/api/portal/projects', $headers)->assertForbidden();
    $this->getJson('/api/portal/tickets', $headers)->assertOk();
});

it('opens, answers and closes a support ticket from the portal', function () {
    Mail::fake();
    [$admin, $customer, $contact] = portalSetup();
    signIn($admin);
    $agent = staffMember($admin->company);
    $department = $this->postJson('/api/setup/support-departments', ['name' => 'Technical', 'member_ids' => [$agent->id]])->json('data.id');
    $priority = $this->getJson('/api/setup/ticket-priorities')->json('data.0.id');
    auth()->forgetGuards();
    $headers = portalLogin($this);

    $this->getJson('/api/portal/tickets/options', $headers)->assertJsonPath('data.departments.0.id', $department);
    $id = $this->postJson('/api/portal/tickets', ['subject' => 'Cannot login', 'message' => 'Help', 'support_department_id' => $department, 'ticket_priority_id' => $priority], $headers)
        ->assertCreated()->json('data.id');
    $ticket = Ticket::find($id);
    expect($ticket->company_id)->toBe($admin->company_id)->and($ticket->contact_id)->toBe($contact->id)
        ->and(AppNotification::where('user_id', $agent->id)->exists())->toBeTrue();
    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => $m->hasTo('asha@acme.test'));

    $this->postJson("/api/portal/tickets/{$id}/reply", ['message' => 'Still broken'], $headers)->assertCreated();
    $this->getJson("/api/portal/tickets/{$id}", $headers)->assertJsonCount(1, 'data.replies')->assertJsonPath('data.status.name', 'Open');
    // Settings → Support "Allow customer to change ticket status" (off by default, as in Perfex).
    $this->postJson("/api/portal/tickets/{$id}/close", [], $headers)->assertForbidden();
    Options::set('allow_customer_to_change_ticket_status', '1', $ticket->company_id);
    $this->postJson("/api/portal/tickets/{$id}/close", [], $headers)->assertOk();
    expect($ticket->refresh()->status->system_key)->toBe('closed');

    // Another customer's contact cannot see it.
    $other = Customer::factory()->create(['company_id' => $admin->company_id]);
    Contact::create(['customer_id' => $other->id, 'first_name' => 'B', 'email' => 'b@x.test', 'password' => 'secret123', 'active' => true, 'is_primary' => true]);
    $this->getJson("/api/portal/tickets/{$id}", portalLogin($this, 'b@x.test'))->assertNotFound();
});

it('shows only tasks marked visible and lets the customer comment', function () {
    [$admin, $customer] = portalSetup();
    $project = Project::factory()->for($customer)->create(['company_id' => $admin->company_id]);
    $visible = Task::factory()->for($project)->create(['visible_to_client' => true, 'name' => 'Visible']);
    Task::factory()->for($project)->create(['visible_to_client' => false]);
    $headers = portalLogin($this);

    $this->getJson("/api/portal/projects/{$project->id}", $headers)->assertOk()->assertJsonCount(1, 'data.tasks')->assertJsonPath('data.tasks.0.name', 'Visible');
    $this->postJson("/api/portal/projects/{$project->id}/tasks/{$visible->id}/comments", ['content' => 'Looks good'], $headers)->assertCreated();
    $this->getJson("/api/portal/projects/{$project->id}/tasks/{$visible->id}", $headers)->assertJsonPath('data.comments.0.is_customer', true);

    $project->update(['customer_settings' => ['view_tasks' => false]]);
    $this->getJson("/api/portal/projects/{$project->id}", $headers)->assertJsonCount(0, 'data.tasks');
});

it('lets staff invite a contact to set a password, and the contact set it', function () {
    Mail::fake();
    [$admin, , $contact] = portalSetup();
    $contact->update(['password' => null]);
    signIn($admin);
    $this->postJson("/api/contacts/{$contact->id}/send-password-email")->assertOk();

    $token = null;
    Mail::assertSent(TemplateMail::class, function (TemplateMail $m) use (&$token) {
        preg_match('#/portal/set-password/([A-Za-z0-9]+)#', $m->body, $match);
        $token = $match[1] ?? null;

        return $token !== null;
    });
    auth()->forgetGuards();
    $this->postJson('/api/portal/reset-password', ['token' => $token, 'password' => 'newpass123', 'password_confirmation' => 'newpass123'])->assertOk();
    $this->postJson('/api/portal/reset-password', ['token' => $token, 'password' => 'again12345', 'password_confirmation' => 'again12345'])->assertUnprocessable();
    portalLogin($this, 'asha@acme.test', 'newpass123');
});

it('gives each company its own customers-area login branding', function () {
    $company = Company::factory()->create(['company_name' => 'Kirti Oils', 'public_careers_slug' => 'Kirti', 'short_code' => 'KOI', 'logo' => 'company/logo/kirti.png']);
    Company::factory()->inactive()->create(['public_careers_slug' => 'closed']);

    $this->getJson('/api/portal/branding?company=kirti')->assertOk()
        ->assertJsonPath('data.name', 'Kirti Oils')
        ->assertJsonPath('data.slug', 'kirti')
        ->assertJsonPath('data.logo_url', rtrim(config('services.hrms.storage_url'), '/').'/company/logo/kirti.png');
    $this->getJson('/api/portal/branding?company=KOI')->assertOk()->assertJsonPath('data.name', 'Kirti Oils');
    $this->getJson("/api/portal/branding?company={$company->id}")->assertOk();
    $this->getJson('/api/portal/branding?company=closed')->assertNotFound();
    $this->getJson('/api/portal/branding')->assertNotFound();
});
