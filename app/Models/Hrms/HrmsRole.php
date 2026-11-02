<?php

namespace App\Models\Hrms;

use Illuminate\Database\Eloquent\Model;

/**
 * Read-only view of the HRMS roles table, used by HrmsSync and the HRMS login.
 */
class HrmsRole extends Model
{
    protected $connection = 'hrms';

    protected $table = 'roles';

    public $timestamps = false;
}
