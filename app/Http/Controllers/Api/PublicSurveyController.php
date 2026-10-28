<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Survey;
use App\Models\SurveyQuestion;
use App\Models\SurveyResultSet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Taking part in a survey (Perfex surveys/survey/{id}/{hash}). No login unless the survey is
 * "only for logged in" users; staff with survey rights can preview an inactive survey.
 */
class PublicSurveyController extends Controller
{
    public function show(Request $request, int $id, string $hash): JsonResponse
    {
        $survey = $this->survey($request, $id, $hash);
        $survey->load('questions.options');

        return response()->json(['data' => [
            'subject' => $survey->subject,
            'view_description' => $survey->view_description,
            'already_participated' => $this->ipUsed($request, $survey),
            'questions' => $survey->questions->map(fn (SurveyQuestion $q) => [
                'id' => $q->id, 'type' => $q->type, 'question' => $q->question, 'required' => $q->required,
                'options' => $q->options->map(fn ($o) => ['id' => $o->id, 'description' => $o->description])->values(),
            ])->values(),
        ]]);
    }

    public function submit(Request $request, int $id, string $hash): JsonResponse
    {
        $survey = $this->survey($request, $id, $hash);
        abort_if($this->ipUsed($request, $survey), 403, 'You have already taken part in this survey.');
        $survey->load('questions.options');
        $answers = (array) $request->input('answers', []);
        $errors = [];
        $rows = [];

        foreach ($survey->questions as $q) {
            $value = $answers[$q->id] ?? $answers[(string) $q->id] ?? null;
            if ($q->isChoice()) {
                $chosen = array_values(array_intersect(array_map('intval', (array) $value), $q->options->pluck('id')->all()));
                if ($q->type === 'radio') {
                    $chosen = array_slice($chosen, 0, 1);
                }
                if ($q->required && $chosen === []) {
                    $errors["answers.{$q->id}"] = 'Please answer this question.';
                }
                foreach ($chosen as $optionId) {
                    $rows[] = ['survey_question_id' => $q->id, 'survey_question_option_id' => $optionId, 'answer' => null];
                }
            } else {
                $text = trim(is_scalar($value) ? (string) $value : '');
                if ($q->required && $text === '') {
                    $errors["answers.{$q->id}"] = 'Please answer this question.';
                }
                if (mb_strlen($text) > 10000) {
                    $errors["answers.{$q->id}"] = 'The answer is too long.';
                }
                $rows[] = ['survey_question_id' => $q->id, 'survey_question_option_id' => null, 'answer' => $text];
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        DB::transaction(function () use ($request, $survey, $rows) {
            $set = SurveyResultSet::create([
                'survey_id' => $survey->id,
                'ip' => $request->ip(),
                'user_agent' => mb_substr((string) $request->userAgent(), 0, 149),
                'user_id' => auth('sanctum')->id(),
            ]);
            $set->answers()->createMany($rows);
        });

        return response()->json([
            'message' => 'Thank you for participating in this survey. Your answers are very important to us.',
            'redirect_url' => $survey->redirect_url,
        ], 201);
    }

    private function survey(Request $request, int $id, string $hash): Survey
    {
        $survey = Survey::withoutGlobalScopes()->whereKey($id)->where('hash', $hash)->firstOrFail();
        $user = auth('sanctum')->user();
        $previewer = $user && (int) $user->company_id === (int) $survey->company_id && $user->hasPermission('surveys', 'view');

        abort_unless($survey->active || $previewer, 404);
        abort_if($survey->only_for_logged_in && ! $user, 401, 'Please log in to take part in this survey.');

        return $survey;
    }

    private function ipUsed(Request $request, Survey $survey): bool
    {
        return $survey->ip_restrict && $survey->resultSets()->where('ip', $request->ip())->exists();
    }
}
