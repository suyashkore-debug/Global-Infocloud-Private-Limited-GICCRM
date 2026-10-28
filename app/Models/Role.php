<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * An HRMS role (Company Admin, HR, Manager, ...). Read only, managed in HRMS.
 */
class Role extends Model
{
    use SoftDeletes;

    protected $connection = 'hrms';

    protected $table = 'roles';
}
