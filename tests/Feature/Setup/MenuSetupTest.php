<?php

use App\Models\Company;
use App\Services\Options;

it('saves the company\'s sidebar and Setup menus, and resets them', function () {
    $admin = signIn(companyAdmin());

    $items = [
        ['id' => '/leads', 'label' => 'Enquiries', 'icon' => 'Star'],
        ['id' => '/'],
        ['id' => 'sales', 'children' => [['id' => '/invoices'], ['id' => '/proposals', 'hidden' => true]]],
        ['id' => 'purchase', 'hidden' => true],
        // Setup can never be hidden: it is the way back to Menu Setup.
        ['id' => '/settings', 'hidden' => true],
    ];
    $this->putJson('/api/setup/menu/sidebar', ['items' => $items])->assertOk()
        ->assertJsonPath('data.0', ['id' => '/leads', 'label' => 'Enquiries', 'icon' => 'Star'])
        ->assertJsonPath('data.2.children.1', ['id' => '/proposals', 'hidden' => true])
        ->assertJsonPath('data.4', ['id' => '/settings']);
    $this->putJson('/api/setup/menu/setup', ['items' => [['id' => 'misc', 'label' => 'More', 'hidden' => true, 'children' => [['id' => 'menu-setup', 'hidden' => true], ['id' => 'backup']]]]])->assertOk()
        ->assertJsonPath('data.0', ['id' => 'misc', 'label' => 'More', 'children' => [['id' => 'menu-setup'], ['id' => 'backup']]]);

    // Every screen reads it with the company's settings.
    $options = $this->getJson('/api/app-options')->assertOk()->json('data');
    expect(json_decode($options['menu_setup'], true)[0]['label'])->toBe('Enquiries')
        ->and(json_decode($options['setup_menu_setup'], true)[0]['label'])->toBe('More');
    $this->getJson('/api/setup/menu')->assertJsonPath('data.sidebar.3', ['id' => 'purchase', 'hidden' => true]);

    // Another company keeps the default menu.
    signIn(companyAdmin(Company::factory()->create()));
    $this->getJson('/api/app-options')->assertJsonPath('data.menu_setup', '');

    // Reset to default.
    signIn($admin);
    $this->putJson('/api/setup/menu/sidebar', ['items' => null])->assertOk();
    expect(Options::get('menu_setup'))->toBe('');
});

it('lets only admins change the menu, and checks what is saved', function () {
    $admin = signIn(companyAdmin());
    $this->putJson('/api/setup/menu/sidebar', ['items' => [['id' => '/leads', 'icon' => '<script>']]])->assertJsonValidationErrors('items.0.icon');
    $this->putJson('/api/setup/menu/sidebar', ['items' => [['label' => 'No id']]])->assertJsonValidationErrors('items.0.id');
    $this->putJson('/api/setup/menu/other', ['items' => []])->assertNotFound();

    // The general settings form cannot write the menu around these checks.
    $this->putJson('/api/setup/options', ['options' => ['menu_setup' => 'not json']])->assertOk();
    expect(Options::get('menu_setup'))->toBe('');

    signIn(staffMember($admin->company));
    $this->putJson('/api/setup/menu/sidebar', ['items' => []])->assertForbidden();
    $this->getJson('/api/setup/menu')->assertForbidden();
});
