<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

/**
 * A CRM login token. For an HRMS login it also keeps the HRMS token (encrypted), used for HRMS
 * profile calls and to log out of HRMS too.
 */
class PersonalAccessToken extends SanctumPersonalAccessToken
{
    protected $table = 'crm_personal_access_tokens';

    protected $casts = [
        'abilities' => 'json',
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
        'hrms_token' => 'encrypted',
    ];

    protected $hidden = ['token', 'hrms_token'];
}
