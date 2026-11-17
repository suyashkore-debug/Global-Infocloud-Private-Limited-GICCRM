<?php

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadForm;
use App\Models\User;

function roundRobinForm(array $overrides = []): array
{
    App\Services\DefaultLookups::ensureLeadLists();

    return [
        'name' => 'Website enquiry',
        'fields' => [['type' => 'text', 'name' => 'name', 'label' => 'Name', 'required' => true], ['type' => 'text', 'name' => 'phone', 'label' => 'Phone']],
        'submit_btn_name' => 'Send', 'submit_btn_bg_color' => '#fa6010', 'submit_btn_text_color' => '#ffffff', 'submit_action' => 'message',
        ...$overrides,
    ];
}

it('shares a web form\'s leads out among staff in turn, skipping staff no longer active', function () {
    $admin = signIn(companyAdmin());
    [$a, $b, $c] = [staffMember($admin->company), staffMember($admin->company), staffMember($admin->company)];
    $form = $this->postJson('/api/lead-forms', roundRobinForm(['assignee_ids' => [$a->id, $b->id, $c->id], 'responsible_id' => $admin->id]))->assertCreated()->json('data');
    expect($form['assignee_ids'])->toBe([$a->id, $b->id, $c->id])->and($form['responsible_id'])->toBeNull();

    $send = fn (string $name) => $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => $name])->assertCreated();
    foreach (['One', 'Two', 'Three', 'Four'] as $name) {
        $send($name);
    }
    expect(Lead::orderBy('id')->pluck('assigned_id')->all())->toBe([$a->id, $b->id, $c->id, $a->id]);

    // B leaves: the turn goes A → C → A …
    User::whereKey($b->id)->update(['is_active' => false]);
    $send('Five');
    $send('Six');
    expect(Lead::orderByDesc('id')->limit(2)->pluck('assigned_id')->reverse()->values()->all())->toBe([$c->id, $a->id]);

    // Each one is told about their own lead.
    expect(App\Models\AppNotification::where('user_id', $c->id)->where('description', 'like', '%has been assigned to you')->count())->toBe(2);
});

it('keeps one responsible person when no turn is set, and gives a repeat submission\'s task to the lead\'s owner', function () {
    $admin = signIn(companyAdmin());
    [$a, $b] = [staffMember($admin->company), staffMember($admin->company)];
    $form = $this->postJson('/api/lead-forms', roundRobinForm(['responsible_id' => $a->id, 'assignee_ids' => []]))->assertCreated()->json('data');
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Ravi'])->assertCreated();
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Meera'])->assertCreated();
    expect(Lead::pluck('assigned_id')->unique()->values()->all())->toBe([$a->id]);

    // Turned into a round-robin form that tracks duplicates by phone.
    $this->putJson("/api/lead-forms/{$form['id']}", roundRobinForm(['assignee_ids' => [$a->id, $b->id], 'allow_duplicate' => false, 'track_duplicate_field' => 'phone', 'create_task_on_duplicate' => true]))->assertOk();
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Om', 'phone' => '9000000001'])->assertCreated();
    $om = Lead::where('name', 'Om')->first();
    $this->postJson("/api/public/lead-forms/{$form['form_key']}", ['name' => 'Om again', 'phone' => '+91 90000 00001'])->assertCreated();
    $task = $om->tasks()->first();
    expect($task->assignees()->pluck('user_id')->all())->toBe([$om->assigned_id]);
});

it('refuses staff of another company in the turn', function () {
    signIn(companyAdmin());
    $stranger = companyAdmin(Company::factory()->create());

    $this->postJson('/api/lead-forms', roundRobinForm(['assignee_ids' => [$stranger->id]]))->assertJsonValidationErrors('assignee_ids.0');
    expect(LeadForm::count())->toBe(0);
});
