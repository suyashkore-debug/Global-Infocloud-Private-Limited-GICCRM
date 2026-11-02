<?php

namespace App\Models\Hrms;

use Illuminate\Database\Eloquent\Model;

/**
 * Read-only view of the HRMS companies table, used by HrmsSync and the HRMS login.
 */
class HrmsCompany extends Model
{
    protected $connection = 'hrms';

    protected $table = 'companies';

    public $timestamps = false;
}
