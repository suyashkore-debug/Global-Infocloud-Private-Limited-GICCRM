<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SurveySendLog extends Model
{
    protected $fillable = ['survey_id', 'total', 'sent', 'lists', 'finished', 'user_id'];

    protected function casts(): array
    {
        return ['lists' => 'array', 'finished' => 'boolean'];
    }
}
