<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SurveyQuestionOption extends Model
{
    public $timestamps = false;

    protected $fillable = ['survey_question_id', 'description', 'option_order'];
}
