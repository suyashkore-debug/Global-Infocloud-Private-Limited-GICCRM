<?php

use App\Jobs\SendLeadStatusUpdate;
use App\Models\AppNotification;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use App\Services\DefaultLookups;
use Illuminate\Support\Facades\Queue;

/**
 * A company with Sales (the default) and Post-sales (team: $team): Sales "Demo Done" hands its
 * leads to Post-sales "Onboarding", shared out to the team in turn.
 *
 * @param  array<int, User>  $team
 * @return array{post: LeadPipeline, onboarding: int, demo: int}
 */
function postSales(array $team): array
{
    DefaultLookups::ensureLeadLists();
    $post = test()->postJson('/api/setup/lead-pipelines', ['name' => 'Post-sales', 'color' => '#eb6834', 'sort_order' => 1, 'member_ids' => array_map(fn ($u) => $u->id, $team)])
        ->assertCreated()->json('data.id');
    $onboarding = test()->postJson('/api/setup/lead-statuses', ['name' => 'Onboarding', 'color' => '#2a78d6', 'pipeline_id' => $post])->assertCreated()->json('data.id');
    $demo = LeadStatus::where('name', 'Demo Done')->first();
    test()->putJson("/api/setup/lead-statuses/{$demo->id}", ['name' => 'Demo Done', 'color' => $demo->color, 'move_to_status_id' => $onboarding, 'move_assign' => 'team'])->assertOk();

    return ['post' => LeadPipeline::find($post), 'onboarding' => $onboarding, 'demo' => $demo->id];
}

function pipelineLead(User $by, string $name, string $status = 'New Lead'): Lead
{
    return Lead::create(['name' => $name, 'email' => strtolower($name).'@x.test', 'lead_status_id' => LeadStatus::where('name', $status)->value('id'),
        'lead_source_id' => LeadSource::value('id'), 'created_by' => $by->id, 'assigned_id' => $by->id]);
}

it('starts every company with a Sales pipeline holding its statuses', function () {
    signIn(companyAdmin());
    $rows = $this->getJson('/api/setup/lead-pipelines')->assertOk()->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0])->toMatchArray(['name' => 'Sales', 'is_default' => true, 'statuses_count' => 8])
        ->and(LeadStatus::whereNull('pipeline_id')->count())->toBe(0);
    // A new status goes into the default pipeline.
    $id = $this->postJson('/api/setup/lead-statuses', ['name' => 'Callback', 'color' => '#2a78d6'])->json('data.id');
    expect(LeadStatus::find($id)->pipeline_id)->toBe($rows[0]['id']);
});

it('moves a lead on to the next pipeline and shares it out to that team in turn', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    [$asha, $vikas] = [staffMember($admin->company), staffMember($admin->company)];
    $p = postSales([$asha, $vikas]);
    $one = pipelineLead($admin, 'Ravi');
    $two = pipelineLead($admin, 'Meera');

    $this->postJson('/api/leads/move', ['lead_status_id' => $p['demo'], 'order' => [$one->id]])->assertOk();
    $this->putJson("/api/leads/{$two->id}", ['first_name' => 'Meera', 'email' => 'meera@x.test', 'lead_status_id' => $p['demo'], 'lead_source_id' => $two->lead_source_id, 'assigned_id' => $admin->id])->assertOk();

    expect($one->refresh()->lead_status_id)->toBe($p['onboarding'])
        ->and($one->assigned_id)->toBe($asha->id)
        ->and($two->refresh()->lead_status_id)->toBe($p['onboarding'])
        ->and($two->assigned_id)->toBe($vikas->id)
        ->and($one->activities()->pluck('description'))->toContain('Moved on to the Post-sales workspace (Onboarding)')
        // The new owners hear about it.
        ->and(AppNotification::where('user_id', $asha->id)->where('description', 'like', '%assigned you to lead Ravi%')->exists())->toBeTrue();
    // The lead's status messages are for where it ends up.
    Queue::assertPushed(SendLeadStatusUpdate::class, fn ($job) => $job->leadId === $one->id && $job->statusId === $p['onboarding']);
});

it('shows one pipeline at a time, with each pipeline’s count', function () {
    $admin = signIn(companyAdmin());
    $p = postSales([]);
    pipelineLead($admin, 'Ravi');
    pipelineLead($admin, 'Sunil');
    pipelineLead($admin, 'Meera', 'Onboarding');

    // The default pipeline first: its statuses and leads only.
    $sales = $this->getJson('/api/leads')->assertOk();
    expect($sales->json('meta.pipeline_id'))->toBe(LeadPipeline::where('is_default', true)->value('id'))
        ->and(collect($sales->json('meta.pipelines'))->pluck('count', 'name')->all())->toBe(['Sales' => 2, 'Post-sales' => 1])
        ->and(collect($sales->json('meta.summary'))->pluck('name'))->not->toContain('Onboarding')
        ->and(collect($sales->json('data'))->pluck('name')->sort()->values()->all())->toBe(['Ravi', 'Sunil']);

    $post = $this->getJson("/api/leads?pipeline_id={$p['post']->id}&kanban=1")->assertOk();
    expect(collect($post->json('meta.summary'))->pluck('name')->all())->toBe(['Onboarding'])
        ->and(collect($post->json('data'))->pluck('name')->all())->toBe(['Meera']);
});

it('lets staff see only the pipelines whose team they are in (and their own leads)', function () {
    $admin = signIn(companyAdmin());
    $member = staffMember($admin->company, ['leads.view']);
    $outsider = staffMember($admin->company, ['leads.view']);
    $p = postSales([$member]);
    $theirs = pipelineLead($admin, 'Meera', 'Onboarding');
    $mine = pipelineLead($admin, 'Kiran', 'Onboarding');
    $mine->update(['assigned_id' => $outsider->id]);
    pipelineLead($admin, 'Ravi');

    signIn($member);
    expect(collect($this->getJson("/api/leads?pipeline_id={$p['post']->id}")->json('data'))->pluck('name')->sort()->values()->all())->toBe(['Kiran', 'Meera']);

    signIn($outsider);
    $list = $this->getJson('/api/leads')->assertOk();
    // Post-sales is listed only for the lead given to them, and shows only that one.
    expect(collect($list->json('meta.pipelines'))->pluck('count', 'name')->all())->toBe(['Sales' => 1, 'Post-sales' => 1])
        ->and(collect($list->json('data'))->pluck('name')->all())->toBe(['Ravi'])
        ->and(collect($this->getJson("/api/leads?pipeline_id={$p['post']->id}")->json('data'))->pluck('name')->all())->toBe(['Kiran']);
    $this->getJson("/api/leads/{$theirs->id}")->assertForbidden();
    $this->getJson("/api/leads/{$mine->id}")->assertOk();

    // Without the Post-sales lead, Post-sales is not theirs at all.
    $mine->update(['assigned_id' => $admin->id]);
    expect(collect($this->getJson('/api/leads')->json('meta.pipelines'))->pluck('name')->all())->toBe(['Sales']);
});

it('checks the pipeline settings', function () {
    signIn(companyAdmin());
    $p = postSales([]);
    $sales = LeadPipeline::where('is_default', true)->first();

    $this->putJson("/api/setup/lead-statuses/{$p['onboarding']}", ['name' => 'Onboarding', 'color' => '#2a78d6', 'move_to_status_id' => $p['onboarding']])
        ->assertJsonValidationErrors(['move_to_status_id' => 'A status cannot move leads to itself.']);
    $this->putJson("/api/setup/lead-statuses/{$p['onboarding']}", ['name' => 'Onboarding', 'color' => '#2a78d6', 'move_to_status_id' => $p['demo'], 'move_assign' => 'user'])
        ->assertJsonValidationErrors('move_assign_user_id');
    $this->deleteJson("/api/setup/lead-pipelines/{$sales->id}")->assertStatus(422);
    $this->deleteJson("/api/setup/lead-pipelines/{$p['post']->id}")->assertStatus(422);

    // Deleting the status a rule points to clears the rule.
    $this->deleteJson("/api/setup/lead-statuses/{$p['onboarding']}")->assertOk();
    expect(LeadStatus::find($p['demo'])->move_to_status_id)->toBeNull();
    $this->deleteJson("/api/setup/lead-pipelines/{$p['post']->id}")->assertOk();

    // Making another pipeline the default takes it from Sales.
    $id = $this->postJson('/api/setup/lead-pipelines', ['name' => 'Support', 'color' => '#2a78d6', 'is_default' => true])->json('data.id');
    expect(LeadPipeline::where('is_default', true)->pluck('id')->all())->toBe([$id]);
});

it('lists the workspaces for the header switcher, with their open leads', function () {
    $admin = signIn(companyAdmin());
    $member = staffMember($admin->company, ['leads.view']);
    $outsider = staffMember($admin->company, ['leads.view']);
    postSales([$member]);
    pipelineLead($admin, 'Ravi');
    pipelineLead($admin, 'Meera', 'Onboarding');
    pipelineLead($admin, 'Lost one')->update(['lost' => true]);

    expect(collect($this->getJson('/api/leads/workspaces')->assertOk()->json('data'))->pluck('count', 'name')->all())->toBe(['Sales' => 1, 'Post-sales' => 1]);
    signIn($member);
    expect(collect($this->getJson('/api/leads/workspaces')->json('data'))->pluck('name')->all())->toBe(['Sales', 'Post-sales']);
    signIn($outsider);
    expect(collect($this->getJson('/api/leads/workspaces')->json('data'))->pluck('name')->all())->toBe(['Sales']);
});

it('shows only the picked workspace’s leads everywhere (header X-Lead-Workspace)', function () {
    $admin = signIn(companyAdmin());
    $p = postSales([]);
    pipelineLead($admin, 'Ravi Sales')->update(['next_follow_up_at' => now()->addDay()]);
    pipelineLead($admin, 'Meera Post', 'Onboarding')->update(['next_follow_up_at' => now()->addDay()]);
    $post = ['X-Lead-Workspace' => (string) $p['post']->id];
    $range = 'start='.today()->toDateString().'&end='.today()->addDays(7)->toDateString();
    $titles = fn ($r) => collect($r->json('data'))->where('type', 'follow_up')->pluck('title')->implode(' ');

    // Nothing picked: the default (Sales) workspace.
    $funnel = collect($this->getJson('/api/dashboard/insights')->json('data.leads.statuses'))->pluck('name');
    expect($funnel)->toContain('New Lead')->not->toContain('Onboarding')
        ->and($this->getJson('/api/leads/follow-ups')->json('data.upcoming_count') ?? null)->not->toBe(-1)
        ->and($titles($this->getJson("/api/calendar?{$range}")))->toContain('Ravi Sales')->not->toContain('Meera Post');

    // Post-sales picked.
    expect(collect($this->getJson('/api/dashboard/insights', $post)->json('data.leads.statuses'))->pluck('name')->all())->toBe(['Onboarding'])
        ->and($titles($this->getJson("/api/calendar?{$range}", $post)))->toContain('Meera Post')->not->toContain('Ravi Sales')
        ->and(collect($this->getJson('/api/search?q=Ravi', $post)->json('data.leads') ?? [])->count())->toBe(0)
        ->and(collect($this->getJson('/api/leads', $post)->json('data'))->pluck('name')->all())->toBe(['Meera Post'])
        ->and(collect($this->getJson('/api/leads/dashboard?period=30d', $post)->json('data.pipeline'))->pluck('name')->all())->toBe(['Onboarding']);

    // A workspace the person does not have is ignored (their default instead).
    $outsider = staffMember($admin->company, ['leads.view']);
    LeadPipeline::whereKey($p['post']->id)->update(['member_ids' => [$admin->id]]);
    signIn($outsider);
    expect(collect($this->getJson('/api/leads', $post)->json('data'))->pluck('name')->all())->toBe(['Ravi Sales']);
});

it('creates leads in their workspace: new leads, web forms and imports', function () {
    $admin = signIn(companyAdmin());
    $p = postSales([]);
    $post = ['X-Lead-Workspace' => (string) $p['post']->id];

    // The status list says which workspace is open (new leads start there).
    expect($this->getJson('/api/setup/lead-statuses', $post)->json('meta.workspace_id'))->toBe($p['post']->id)
        ->and($this->getJson('/api/setup/lead-statuses')->json('meta.workspace_id'))->toBe(LeadPipeline::where('is_default', true)->value('id'));

    // Import into Post-sales: a Status column only names Post-sales statuses (others fall back).
    $install = LeadStatus::where('name', 'Installation')->value('id') ?? $this->postJson('/api/setup/lead-statuses', ['name' => 'Installation', 'color' => '#16a34a', 'pipeline_id' => $p['post']->id])->json('data.id');
    $file = Illuminate\Http\UploadedFile::fake()->createWithContent('leads.csv', "Name,Email,Status\nAsha,asha@x.test,Installation\nKiran,kiran@x.test,New Lead\n");
    $this->post('/api/leads/import', ['file' => $file, 'status_id' => $p['onboarding'], 'source_id' => LeadSource::value('id')], ['Accept' => 'application/json'])->assertOk();
    expect(Lead::where('name', 'Asha')->value('lead_status_id'))->toBe($install)
        ->and(Lead::where('name', 'Kiran')->value('lead_status_id'))->toBe($p['onboarding']);

    // A web form set to a Post-sales status fills Post-sales.
    $form = $this->postJson('/api/lead-forms', [
        'name' => 'Service request', 'lead_status_id' => $p['onboarding'],
        'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name', 'required' => true]],
        'submit_btn_name' => 'Send', 'submit_btn_bg_color' => '#fa6010', 'submit_btn_text_color' => '#ffffff', 'submit_action' => 'message',
    ])->assertCreated()->json('data');
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Webby'])->assertCreated();
    expect(Lead::where('name', 'Webby')->value('lead_status_id'))->toBe($p['onboarding']);
});

it('lists only the open workspace’s web forms', function () {
    signIn(companyAdmin());
    $p = postSales([]);
    $form = fn (string $name, ?int $status) => $this->postJson('/api/lead-forms', [
        'name' => $name, 'lead_status_id' => $status, 'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name', 'required' => true]],
        'submit_btn_name' => 'Send', 'submit_btn_bg_color' => '#fa6010', 'submit_btn_text_color' => '#ffffff', 'submit_action' => 'message',
    ])->assertCreated();
    $form('Website enquiry', null);
    $form('Service request', $p['onboarding']);

    expect(collect($this->getJson('/api/lead-forms')->json('data'))->pluck('name')->all())->toBe(['Website enquiry'])
        ->and(collect($this->getJson('/api/lead-forms', ['X-Lead-Workspace' => (string) $p['post']->id])->json('data'))->pluck('name')->all())->toBe(['Service request']);
});

it('keeps a converted lead in its own workspace', function () {
    $admin = signIn(companyAdmin());
    $p = postSales([]);
    $post = pipelineLead($admin, 'Meera', 'Onboarding');
    $sales = pipelineLead($admin, 'Ravi');

    $this->postJson("/api/leads/{$post->id}/convert", ['contact_first_name' => 'Meera', 'email' => 'meera.c@x.test'])->assertSuccessful();
    $this->postJson("/api/leads/{$sales->id}/convert", ['contact_first_name' => 'Ravi', 'email' => 'ravi.c@x.test'])->assertSuccessful();

    expect($post->refresh()->lead_status_id)->toBe($p['onboarding'])
        ->and($post->customer_id)->not->toBeNull()
        ->and(LeadStatus::find($sales->refresh()->lead_status_id)->is_default)->toBeTrue();
});
