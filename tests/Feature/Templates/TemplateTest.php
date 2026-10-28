<?php

use App\Models\Customer;
use App\Support\RichText;

it('keeps formatting but removes anything unsafe from rich content', function () {
    $html = '<h2 onclick="steal()">Scope</h2><p style="color:red">Hi <b>there</b><script>alert(1)</script></p>'
        .'<table border="1"><tr><td colspan="2">Cell</td></tr></table><a href="javascript:alert(1)">bad</a><a href="https://gic.test" target="x">ok</a>'
        .'<img src="https://gic.test/a.png" onerror="x()"><iframe src="https://evil.test"></iframe><custom-tag>kept text</custom-tag>'
        .'<p style="background:url(https://evil.test)">bg</p>';
    $clean = RichText::clean($html);

    expect($clean)->toContain('<h2>Scope</h2>')->toContain('<p style="color:red">')->toContain('<b>there</b>')->toContain('<td colspan="2">Cell</td>')
        ->toContain('<a href="https://gic.test" target="_blank" rel="noopener noreferrer">ok</a>')->toContain('<img src="https://gic.test/a.png">')->toContain('kept text')
        ->not->toContain('script')->not->toContain('onclick')->not->toContain('onerror')->not->toContain('javascript')->not->toContain('iframe')->not->toContain('url(')
        ->and(RichText::clean("Line 1\nLine 2 <3"))->toBe("Line 1\nLine 2 <3")
        ->and(RichText::toHtml("Line 1\nLine 2 <3"))->toBe("Line 1<br />\nLine 2 &lt;3")
        ->and(RichText::toHtml('<p>Hindi हिंदी · मराठी</p>'))->toBe('<p>Hindi हिंदी · मराठी</p>');
});

it('lets proposal and contract writers keep their own templates and insert them', function () {
    $admin = companyAdmin();
    $writer = staffMember($admin->company, ['proposals.create', 'contracts.create']);
    $lead = staffMember($admin->company, ['proposals.create', 'proposals.view_all_templates']);
    $reader = staffMember($admin->company, ['proposals.view']);

    signIn($writer);
    $id = $this->postJson('/api/templates', ['type' => 'proposals', 'name' => 'ERP proposal', 'content' => '<h2>ERP</h2><p>Scope<script>x</script></p>'])
        ->assertCreated()->assertJsonPath('data.can_manage', true)->json('data.id');
    $this->postJson('/api/templates', ['type' => 'contracts', 'name' => 'AMC', 'content' => '<p>Terms</p>'])->assertCreated();
    $this->getJson("/api/templates/{$id}")->assertJsonPath('data.content', '<h2>ERP</h2><p>Scope</p>');
    $this->getJson('/api/templates?type=proposals')->assertJsonCount(1, 'data');

    signIn($lead);
    $this->getJson('/api/templates?type=proposals')->assertJsonCount(1, 'data')->assertJsonPath('data.0.can_manage', false)->assertJsonPath('data.0.author', $writer->full_name);
    $this->getJson("/api/templates/{$id}")->assertOk();
    $this->putJson("/api/templates/{$id}", ['name' => 'Mine now'])->assertForbidden();
    $this->getJson('/api/templates?type=contracts')->assertForbidden();

    signIn($reader);
    $this->getJson('/api/templates?type=proposals')->assertForbidden();

    signIn($admin);
    $this->putJson("/api/templates/{$id}", ['name' => 'ERP proposal v2', 'content' => '<p>New</p>'])->assertOk()->assertJsonPath('data.name', 'ERP proposal v2');
    $this->deleteJson("/api/templates/{$id}")->assertOk();

    // Proposal content keeps its formatting and comes back ready to show.
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    $this->postJson('/api/proposals', ['subject' => 'Website', 'content' => '<p onclick="x()">Hello <b>team</b></p>', 'customer_id' => $customer->id, 'date' => today()->toDateString(),
        'items' => [['description' => 'Design', 'qty' => 1, 'rate' => 100]]])
        ->assertCreated()->assertJsonPath('data.content', '<p>Hello <b>team</b></p>')->assertJsonPath('data.content_html', '<p>Hello <b>team</b></p>');
});
