<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A role (Company Admin, HR, Manager, ...), copied from HRMS by HrmsSync.
 */
class Role extends Model
{
    use SoftDeletes;

    protected $table = 'crm_roles';

    protected $guarded = ['id'];
}
