<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One browser or phone that receives a staff member's CRM notifications (Web Push).
 */
class PushSubscription extends Model
{
    protected $fillable = ['user_id', 'endpoint', 'public_key', 'auth_token', 'user_agent'];

    protected $hidden = ['public_key', 'auth_token'];
}
