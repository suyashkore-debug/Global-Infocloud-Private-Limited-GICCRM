<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Feature tests wipe their database (RefreshDatabase). Stop before that unless it is the test
     * database, e.g. when a cached config (php artisan config:cache) points at the real one.
     */
    protected function setUpTraits()
    {
        foreach (['mysql', 'hrms'] as $connection) {
            $database = config("database.connections.{$connection}.database");
            if ($database !== 'projectsapp_test') {
                throw new RuntimeException("Tests stopped: the {$connection} connection uses \"{$database}\", not projectsapp_test. Run php artisan config:clear first.");
            }
        }

        return parent::setUpTraits();
    }
}
