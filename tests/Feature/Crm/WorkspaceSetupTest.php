<?php

use App\Models\Customer;
use App\Models\EmailTemplate;
use App\Models\Invoice;
use App\Models\LeadPipeline;
use App\Services\DefaultLookups;
use App\Services\Emails;
use App\Services\Options;
use App\Support\Workspace;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;

/**
 * Sales (the default workspace) and Post-sales; returns their ids and the header that picks
 * Post-sales.
 *
 * @return array{sales: int, post: int, h: array<string, string>}
 */
function setupWorkspaces(): array
{
    DefaultLookups::ensureLeadLists();
    $sales = LeadPipeline::where('is_default', true)->value('id');
    $post = test()->postJson('/api/setup/lead-pipelines', ['name' => 'Post-sales', 'color' => '#eb6834', 'sort_order' => 1])->json('data.id');

    return ['sales' => $sales, 'post' => $post, 'h' => ['X-Lead-Workspace' => (string) $post]];
}

it('keeps a workspace’s own settings and follows the default workspace for the rest', function () {
    signIn(companyAdmin());
    $w = setupWorkspaces();

    $this->putJson('/api/setup/options', ['options' => ['invoice_due_after' => '15', 'estimate_due_after' => '7']], $w['h'])->assertOk()
        ->assertJsonPath('meta.workspace.name', 'Post-sales')
        ->assertJsonPath('meta.own', ['invoice_due_after']);

    expect($this->getJson('/api/setup/options')->json('data.invoice_due_after'))->toBe('30')
        ->and($this->getJson('/api/setup/options', $w['h'])->json('data.invoice_due_after'))->toBe('15');

    // Not changed in Post-sales: follows Sales.
    $this->putJson('/api/setup/options', ['options' => ['estimate_due_after' => '10']])->assertOk();
    expect($this->getJson('/api/setup/options', $w['h'])->json('data.estimate_due_after'))->toBe('10');

    // Set back to Sales' value: follows Sales again.
    $this->putJson('/api/setup/options', ['options' => ['invoice_due_after' => '30']], $w['h'])->assertJsonPath('meta.own', []);
});

it('keeps the company’s details common to every workspace', function () {
    signIn(companyAdmin());
    $w = setupWorkspaces();

    $this->putJson('/api/setup/options', ['options' => ['company_name' => 'Acme Pvt Ltd']], $w['h'])->assertOk()->assertJsonPath('meta.own', []);
    expect($this->getJson('/api/setup/options')->json('data.company_name'))->toBe('Acme Pvt Ltd');
});

it('numbers invoices without repeating a number across workspaces', function () {
    signIn(companyAdmin());
    $w = setupWorkspaces();
    $make = function (array $headers = []) {
        $customer = $this->postJson('/api/customers', ['name' => 'C'.uniqid()], $headers)->json('data.id');

        return Invoice::withoutGlobalScopes()->find($this->postJson('/api/invoices', ['customer_id' => $customer, 'date' => today()->toDateString(), 'items' => [['description' => 'X', 'qty' => 1, 'rate' => 10]]], $headers)->assertCreated()->json('data.id'));
    };

    // Same prefix: one counter.
    expect($make()->formattedNumber())->toBe('INV-000001')
        ->and($make($w['h'])->formattedNumber())->toBe('INV-000002');

    // Its own prefix: its own counter.
    $this->putJson('/api/setup/options', ['options' => ['invoice_prefix' => 'PS-']], $w['h'])->assertOk();
    expect($make($w['h'])->formattedNumber())->toBe('PS-000001')
        ->and($make()->formattedNumber())->toBe('INV-000003');

    // Sales can't take Post-sales' prefix.
    $this->putJson('/api/setup/options', ['options' => ['invoice_prefix' => 'PS-']])->assertUnprocessable()->assertJsonValidationErrors('options.invoice_prefix');
});

it('shows a workspace’s own list items and the common ones', function () {
    signIn(companyAdmin());
    $w = setupWorkspaces();

    $this->postJson('/api/setup/taxes', ['name' => 'Service tax', 'rate' => 5], $w['h'])->assertCreated()->assertJsonPath('data.workspace_id', $w['post']);
    $this->postJson('/api/setup/taxes', ['name' => 'GST', 'rate' => 18, 'workspace_id' => null], $w['h'])->assertCreated();

    expect(collect($this->getJson('/api/setup/taxes', $w['h'])->json('data'))->pluck('name')->sort()->values()->all())->toBe(['GST', 'Service tax'])
        ->and(collect($this->getJson('/api/setup/taxes')->json('data'))->pluck('name')->all())->toBe(['GST'])
        ->and($this->getJson('/api/setup/taxes')->json('meta.workspaces'))->toHaveCount(2);
});

it('gives each workspace its own e-mail templates and log', function () {
    $admin = signIn(companyAdmin());
    $w = setupWorkspaces();

    $sales = collect($this->getJson('/api/email-templates')->json('data'))->firstWhere('slug', 'invoice-send-to-client');
    $post = collect($this->getJson('/api/email-templates', $w['h'])->json('data'))->firstWhere('slug', 'invoice-send-to-client');
    expect($post['id'])->not->toBe($sales['id']);

    $this->putJson("/api/email-templates/{$post['id']}", ['subject' => 'Post-sales invoice', 'message' => 'Hi'], $w['h'])->assertOk();
    expect(EmailTemplate::withoutGlobalScopes()->find($sales['id'])->subject)->not->toBe('Post-sales invoice');

    // A record's e-mail uses its workspace's template, whatever is open in the header.
    Queue::fake();
    $customer = Customer::withoutGlobalScopes()->find($this->postJson('/api/customers', ['name' => 'Zen'], $w['h'])->json('data.id'));
    $log = Emails::send('invoice-send-to-client', $admin->company_id, 'a@x.test', [], ['rel' => $customer, 'force' => true]);
    expect($log->subject)->toBe('Post-sales invoice')
        ->and($log->workspace_id)->toBe($w['post'])
        ->and($this->getJson('/api/email-logs', $w['h'])->json('data'))->toHaveCount(1)
        ->and($this->getJson('/api/email-logs')->json('data'))->toHaveCount(0);
});

it('runs queued jobs with the settings of the workspace they were sent from', function () {
    $admin = signIn(companyAdmin());
    $w = setupWorkspaces();
    $this->putJson('/api/setup/options', ['options' => ['invoice_due_after' => '15']], $w['h'])->assertOk();

    Options::within($w['sales'], function () use ($admin) {
        dispatch(new SeeDueAfter($admin->company_id));
    });
    expect(Cache::get('seen'))->toBe('30');

    Options::within($w['post'], function () use ($admin) {
        dispatch(new SeeDueAfter($admin->company_id));
    });
    expect(Cache::get('seen'))->toBe('15');
});

/** A queued job noting the setting it sees. */
class SeeDueAfter implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $company) {}

    public function handle(): void
    {
        Cache::put('seen', Options::get('invoice_due_after', $this->company));
    }
}

it('gives a webhook URL of the workspace with its own WhatsApp number', function () {
    $admin = signIn(companyAdmin());
    $w = setupWorkspaces();

    expect($this->getJson('/api/settings/whatsapp')->json('data.webhook_url'))->not->toContain('workspace=')
        ->and($this->getJson('/api/settings/whatsapp', $w['h'])->json('data.webhook_url'))->toEndWith("?workspace={$w['post']}");

    // Meta checks the URL with that workspace's verify token.
    Options::within($w['post'], fn () => Options::set('whatsapp_verify_token', 'post-token', $admin->company_id));
    $this->get("/api/whatsapp/webhook/{$admin->company_id}?workspace={$w['post']}&hub_mode=subscribe&hub_verify_token=post-token&hub_challenge=ok")->assertOk()->assertSee('ok');
    $this->get("/api/whatsapp/webhook/{$admin->company_id}?hub_mode=subscribe&hub_verify_token=post-token&hub_challenge=ok")->assertForbidden();
    expect(Workspace::activeId())->not->toBe($w['post']);
});
