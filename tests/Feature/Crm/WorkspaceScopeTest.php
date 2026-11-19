<?php

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\LeadPipeline;
use App\Models\LeadStatus;
use App\Models\Project;
use App\Models\Task;
use App\Services\DefaultLookups;

/**
 * Two workspaces (Sales, the default, and Post-sales with the given team); returns their ids and
 * the header that picks Post-sales.
 *
 * @return array{sales: int, post: int, h: array<string, string>}
 */
function twoWorkspaces(array $team = []): array
{
    $sales = salesWorkspace();
    $post = test()->postJson('/api/setup/lead-pipelines', ['name' => 'Post-sales', 'color' => '#eb6834', 'sort_order' => 1, 'member_ids' => array_map(fn ($u) => $u->id, $team)])->json('data.id');

    return ['sales' => $sales, 'post' => $post, 'h' => ['X-Lead-Workspace' => (string) $post]];
}

it('keeps customers, invoices, projects and tasks in the workspace they were made in', function () {
    $admin = signIn(companyAdmin());
    $w = twoWorkspaces();

    $acme = $this->postJson('/api/customers', ['name' => 'Acme Sales'])->assertCreated()->json('data.id');
    $zen = $this->postJson('/api/customers', ['name' => 'Zen Post'], $w['h'])->assertCreated()->json('data.id');
    expect(Customer::withoutGlobalScope('workspace')->find($acme)->workspace_id)->toBe($w['sales'])
        ->and(Customer::withoutGlobalScope('workspace')->find($zen)->workspace_id)->toBe($w['post']);

    // Each workspace lists its own.
    expect(collect($this->getJson('/api/customers')->json('data'))->pluck('name')->all())->toBe(['Acme Sales'])
        ->and(collect($this->getJson('/api/customers', $w['h'])->json('data'))->pluck('name')->all())->toBe(['Zen Post']);

    // A record made for a customer goes into the customer's workspace.
    $invoice = $this->postJson('/api/invoices', ['customer_id' => $zen, 'date' => today()->toDateString(), 'items' => [['description' => 'Setup', 'qty' => 1, 'rate' => 100]]], $w['h'])->assertCreated()->json('data.id');
    expect(Invoice::withoutGlobalScope('workspace')->find($invoice)->workspace_id)->toBe($w['post'])
        ->and($this->getJson('/api/invoices')->json('data'))->toHaveCount(0)
        ->and($this->getJson('/api/invoices', $w['h'])->json('data'))->toHaveCount(1);

    $project = Project::create(['name' => 'Rollout', 'customer_id' => $zen, 'start_date' => today(), 'billing_type' => 1, 'status' => 1, 'created_by' => $admin->id]);
    $task = $this->postJson('/api/tasks', ['name' => 'Install', 'project_id' => $project->id, 'priority' => 2, 'start_date' => today()->toDateString()], $w['h'])->assertCreated()->json('data.id');
    $task = Task::withoutGlobalScope('workspace')->find($task);
    expect($project->workspace_id)->toBe($w['post'])->and($task->workspace_id)->toBe($w['post']);
});

it('opens a record of another workspace by its link, with that workspace’s related records', function () {
    $admin = signIn(companyAdmin());
    $member = staffMember($admin->company, ['customers.view']);
    $outsider = staffMember($admin->company, ['customers.view']);
    $w = twoWorkspaces([$member]);
    $zen = $this->postJson('/api/customers', ['name' => 'Zen Post'], $w['h'])->json('data.id');

    // From Sales (no header), the Post-sales customer still opens for those who work in Post-sales,
    // and the app is told to switch to Post-sales.
    $this->getJson("/api/customers/{$zen}")->assertOk()->assertJsonPath('data.name', 'Zen Post')->assertHeader('X-Record-Workspace', (string) $w['post']);
    $this->getJson("/api/customers/{$zen}", $w['h'])->assertOk()->assertHeaderMissing('X-Record-Workspace');
    signIn($member);
    $this->getJson("/api/customers/{$zen}")->assertOk();
    signIn($outsider);
    $this->getJson("/api/customers/{$zen}")->assertNotFound();
    // And their lists never show it, whatever they ask for.
    expect(collect($this->getJson('/api/customers', $w['h'])->json('data'))->pluck('name'))->not->toContain('Zen Post');
});

it('shows older records (without a workspace) in the default workspace', function () {
    signIn(companyAdmin());
    $w = twoWorkspaces();
    $old = $this->postJson('/api/customers', ['name' => 'Old Co'])->json('data.id');
    Customer::withoutGlobalScope('workspace')->whereKey($old)->update(['workspace_id' => null]);

    expect(collect($this->getJson('/api/customers')->json('data'))->pluck('name')->all())->toBe(['Old Co'])
        ->and($this->getJson('/api/customers', $w['h'])->json('data'))->toHaveCount(0);
});

it('makes a converted lead’s customer in the lead’s workspace', function () {
    $admin = signIn(companyAdmin());
    $w = twoWorkspaces();
    $onboarding = $this->postJson('/api/setup/lead-statuses', ['name' => 'Onboarding', 'color' => '#2a78d6', 'pipeline_id' => $w['post']])->json('data.id');
    $lead = App\Models\Lead::create(['name' => 'Meera', 'email' => 'meera@x.test', 'lead_status_id' => $onboarding, 'lead_source_id' => App\Models\LeadSource::value('id'), 'created_by' => $admin->id]);

    $customer = $this->postJson("/api/leads/{$lead->id}/convert", ['contact_first_name' => 'Meera', 'email' => 'meera.c@x.test'])->assertSuccessful()->json('data.id');
    expect(Customer::withoutGlobalScope('workspace')->find($customer)->workspace_id)->toBe($w['post'])
        ->and($lead->refresh()->lead_status_id)->toBe($onboarding);
});

it('keeps the single-workspace company as it was (no narrowing)', function () {
    signIn(companyAdmin());
    DefaultLookups::ensureLeadLists();
    $this->postJson('/api/customers', ['name' => 'Only Co'])->assertCreated();
    expect(collect($this->getJson('/api/customers', ['X-Lead-Workspace' => '999999'])->json('data'))->pluck('name')->all())->toBe(['Only Co']);
});
