<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendSurveyEmails;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\MailListEmail;
use App\Models\Survey;
use App\Models\SurveyAnswer;
use App\Models\SurveyQuestion;
use App\Models\SurveySendLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Perfex Utilities → Surveys: build surveys, send them, read the results.
 */
class SurveyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => Survey::withCount(['questions', 'resultSets as participants'])->latest()->get()
            ->map(fn (Survey $s) => [...$this->summary($s), 'questions_count' => $s->questions_count, 'participants' => $s->participants])]);
    }

    public function show(Request $request, Survey $survey): JsonResponse
    {
        $this->allow($request, 'view');

        return response()->json(['data' => $this->detail($survey)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->allow($request, 'create');
        $survey = DB::transaction(function () use ($request) {
            $data = $this->validated($request);
            $survey = Survey::create([...$data['survey'], 'hash' => Str::random(32), 'created_by' => $request->user()->id]);
            $this->syncQuestions($survey, $data['questions']);

            return $survey;
        });

        return response()->json(['data' => $this->detail($survey)], 201);
    }

    public function update(Request $request, Survey $survey): JsonResponse
    {
        $this->allow($request, 'edit');
        DB::transaction(function () use ($request, $survey) {
            $data = $this->validated($request);
            $survey->update($data['survey']);
            $this->syncQuestions($survey, $data['questions']);
        });

        return response()->json(['data' => $this->detail($survey->refresh())]);
    }

    public function destroy(Request $request, Survey $survey): JsonResponse
    {
        $this->allow($request, 'delete');
        $survey->delete();

        return response()->json(['message' => 'Survey deleted.']);
    }

    /**
     * Results: participants, and per question the count / percent of each option or the text
     * answers.
     */
    public function results(Request $request, Survey $survey): JsonResponse
    {
        $this->allow($request, 'view');
        $survey->load('questions.options');
        $participants = $survey->resultSets()->count();
        $answers = SurveyAnswer::whereIn('survey_question_id', $survey->questions->pluck('id'))->get()->groupBy('survey_question_id');

        return response()->json(['data' => [
            'survey' => $this->summary($survey),
            'participants' => $participants,
            'questions' => $survey->questions->map(function (SurveyQuestion $q) use ($answers, $participants) {
                $given = $answers->get($q->id, collect());
                $answered = $given->pluck('survey_result_set_id')->unique()->count();

                return [
                    'id' => $q->id,
                    'type' => $q->type,
                    'question' => $q->question,
                    'answered' => $answered,
                    'options' => $q->isChoice() ? $q->options->map(fn ($o) => [
                        'id' => $o->id,
                        'description' => $o->description,
                        'count' => $c = $given->where('survey_question_option_id', $o->id)->count(),
                        'percent' => $participants ? round($c / $participants * 100, 1) : 0,
                    ])->values() : [],
                    'answers' => $q->isChoice() ? [] : $given->pluck('answer')->filter(fn ($a) => trim((string) $a) !== '')->values(),
                ];
            }),
        ]]);
    }

    /**
     * Send the survey by e-mail to staff, customer contacts, leads and / or mail lists.
     */
    public function send(Request $request, Survey $survey): JsonResponse
    {
        $this->allow($request, 'edit');
        $company = $request->user()->company_id;
        $data = $request->validate([
            'staff' => ['boolean'],
            'customers' => ['boolean'],
            'customer_group_ids' => ['nullable', 'array'],
            'customer_group_ids.*' => ['integer'],
            'leads' => ['boolean'],
            'lead_status_ids' => ['nullable', 'array'],
            'lead_status_ids.*' => ['integer'],
            'mail_list_ids' => ['nullable', 'array'],
            'mail_list_ids.*' => ['integer', Rule::exists('mail_lists', 'id')->where('company_id', $company)],
        ]);

        $emails = collect();
        $lists = [];
        if ($data['staff'] ?? false) {
            $emails = $emails->concat(User::where('company_id', $company)->where('is_active', true)->pluck('email'));
            $lists[] = 'Staff';
        }
        if ($data['customers'] ?? false) {
            $emails = $emails->concat(Contact::where('active', true)
                ->whereHas('customer', fn ($q) => $q->when(! empty($data['customer_group_ids']), fn ($c) => $c->whereHas('groups', fn ($g) => $g->whereIn('customer_groups.id', $data['customer_group_ids']))))
                ->pluck('email'));
            $lists[] = empty($data['customer_group_ids']) ? 'Customers (all)' : 'Customers (groups)';
        }
        if ($data['leads'] ?? false) {
            $emails = $emails->concat(Lead::where('lost', false)->where('junk', false)->whereNull('customer_id')
                ->when(! empty($data['lead_status_ids']), fn ($q) => $q->whereIn('lead_status_id', $data['lead_status_ids']))
                ->pluck('email'));
            $lists[] = empty($data['lead_status_ids']) ? 'Leads (all)' : 'Leads (statuses)';
        }
        if (! empty($data['mail_list_ids'])) {
            $emails = $emails->concat(MailListEmail::whereIn('mail_list_id', $data['mail_list_ids'])->pluck('email'));
            $lists[] = 'Mail lists';
        }

        $emails = $emails->map(fn ($e) => strtolower(trim((string) $e)))->filter(fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL))->unique()->values();
        if ($lists === []) {
            return response()->json(['message' => 'Choose who to send the survey to.'], 422);
        }
        if ($emails->isEmpty()) {
            return response()->json(['message' => 'No e-mail addresses found for the chosen lists.'], 422);
        }

        $log = SurveySendLog::create(['survey_id' => $survey->id, 'total' => $emails->count(), 'lists' => $lists, 'user_id' => $request->user()->id]);
        foreach ($emails->chunk(100) as $chunk) {
            SendSurveyEmails::dispatch($survey->id, $log->id, $chunk->values()->all());
        }

        return response()->json(['message' => "The survey is being sent to {$emails->count()} e-mail address(es).", 'data' => $this->detail($survey)]);
    }

    public function deleteSendLog(Request $request, Survey $survey, int $log): JsonResponse
    {
        $this->allow($request, 'edit');
        $survey->sendLogs()->whereKey($log)->delete();

        return response()->json(['message' => 'Removed.']);
    }

    /**
     * @return array{survey: array<string, mixed>, questions: array<int, array<string, mixed>>}
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:20000'],
            'view_description' => ['nullable', 'string', 'max:20000'],
            'from_name' => ['nullable', 'string', 'max:100'],
            'redirect_url' => ['nullable', 'url', 'max:500'],
            'ip_restrict' => ['boolean'],
            'only_for_logged_in' => ['boolean'],
            'active' => ['boolean'],
            'questions' => ['present', 'array', 'max:200'],
            'questions.*.id' => ['nullable', 'integer'],
            'questions.*.type' => ['required', Rule::in(SurveyQuestion::TYPES)],
            'questions.*.question' => ['required', 'string', 'max:5000'],
            'questions.*.required' => ['boolean'],
            'questions.*.options' => ['nullable', 'array', 'max:50'],
            'questions.*.options.*.id' => ['nullable', 'integer'],
            'questions.*.options.*.description' => ['required', 'string', 'max:500'],
        ]);
        foreach ($data['questions'] as $i => $q) {
            if (in_array($q['type'], ['checkbox', 'radio'], true) && empty($q['options'])) {
                abort(response()->json(['message' => 'Add at least one option to every checkbox / radio question.', 'errors' => ["questions.{$i}.options" => ['Add at least one option.']]], 422));
            }
        }

        return [
            'survey' => [
                ...collect($data)->except('questions')->all(),
                'slug' => Str::slug($data['subject']),
            ],
            'questions' => $data['questions'],
        ];
    }

    /**
     * Save the question list as sent: update existing ones (by id), add new ones, remove the rest.
     *
     * @param  array<int, array<string, mixed>>  $questions
     */
    private function syncQuestions(Survey $survey, array $questions): void
    {
        $keep = [];
        foreach (array_values($questions) as $order => $q) {
            $question = ! empty($q['id']) ? $survey->questions()->whereKey($q['id'])->first() : null;
            $attributes = ['type' => $q['type'], 'question' => $q['question'], 'required' => (bool) ($q['required'] ?? false), 'question_order' => $order + 1];
            if ($question) {
                // The type of an answered question doesn't change (its answers would no longer fit).
                if (SurveyAnswer::where('survey_question_id', $question->id)->exists()) {
                    unset($attributes['type']);
                }
                $question->update($attributes);
            } else {
                $question = $survey->questions()->create($attributes);
            }
            $keep[] = $question->id;

            $keepOptions = [];
            foreach (array_values($question->isChoice() ? ($q['options'] ?? []) : []) as $i => $o) {
                $option = ! empty($o['id']) ? $question->options()->whereKey($o['id'])->first() : null;
                $option ? $option->update(['description' => $o['description'], 'option_order' => $i + 1])
                    : $option = $question->options()->create(['description' => $o['description'], 'option_order' => $i + 1]);
                $keepOptions[] = $option->id;
            }
            $question->options()->whereNotIn('id', $keepOptions)->delete();
        }
        $survey->questions()->whereNotIn('id', $keep)->delete();
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(Survey $s): array
    {
        return [
            'id' => $s->id,
            'subject' => $s->subject,
            'active' => $s->active,
            'url' => $s->publicUrl(),
            'path' => "/survey/{$s->id}/{$s->hash}",
            'created_at' => $s->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(Survey $s): array
    {
        $s->load(['questions.options', 'sendLogs']);

        return [
            ...$this->summary($s),
            'description' => $s->description,
            'view_description' => $s->view_description,
            'from_name' => $s->from_name,
            'redirect_url' => $s->redirect_url,
            'ip_restrict' => $s->ip_restrict,
            'only_for_logged_in' => $s->only_for_logged_in,
            'participants' => $s->resultSets()->count(),
            'questions' => $s->questions->map(fn (SurveyQuestion $q) => [
                'id' => $q->id, 'type' => $q->type, 'question' => $q->question, 'required' => $q->required,
                'options' => $q->options->map(fn ($o) => ['id' => $o->id, 'description' => $o->description])->values(),
            ])->values(),
            'send_logs' => $s->sendLogs->map(fn (SurveySendLog $l) => [
                'id' => $l->id, 'total' => $l->total, 'sent' => $l->sent, 'lists' => $l->lists, 'finished' => $l->finished,
                'created_at' => $l->created_at?->toIso8601String(),
            ])->values(),
        ];
    }

    private function allow(Request $request, string $capability): void
    {
        abort_unless($request->user()->hasPermission('surveys', $capability), 403);
    }
}
