<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

/**
 * Tokens live in the HRMS database: HRMS issues them at login (device_type "projects") and
 * this app only checks them, so logging out or deactivating a user in HRMS signs them out here too.
 */
class PersonalAccessToken extends SanctumPersonalAccessToken
{
    protected $connection = 'hrms';
}
