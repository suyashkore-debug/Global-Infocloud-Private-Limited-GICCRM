<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SurveyAnswer extends Model
{
    public $timestamps = false;

    protected $fillable = ['survey_result_set_id', 'survey_question_id', 'survey_question_option_id', 'answer'];
}
