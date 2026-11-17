<?php

use Tests\TestCase;

uses(TestCase::class);

// The tests wipe their database: it must always be the test one, never the app's real data.
it('runs against the test database only', function () {
    expect(config('database.connections.mysql.database'))->toBe('projectsapp_test')
        ->and(config('database.connections.hrms.database'))->toBe('projectsapp_test')
        ->and(app()->environment())->toBe('testing');
});
