<?php

namespace App\Models\Hrms;

use Illuminate\Database\Eloquent\Model;

/**
 * Read-only view of the HRMS users table, used by HrmsSync and the HRMS login.
 */
class HrmsUser extends Model
{
    protected $connection = 'hrms';

    protected $table = 'users';

    public $timestamps = false;
}
