<?php

namespace App\Models\Hrms;

use Illuminate\Database\Eloquent\Model;

/**
 * Read-only view of the HRMS personal_access_tokens table, used by HrmsSync and the HRMS login.
 */
class HrmsAccessToken extends Model
{
    protected $connection = 'hrms';

    protected $table = 'personal_access_tokens';

    public $timestamps = false;
}
