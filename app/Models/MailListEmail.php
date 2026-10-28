<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailListEmail extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['mail_list_id', 'email'];
}
