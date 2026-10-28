<?php

use App\Mail\SurveyInvitation;
use App\Models\Contact;
use App\Models\Customer;
use App\Models\Survey;
use App\Models\SurveySendLog;
use Illuminate\Support\Facades\Mail;

function surveyPayload(array $overrides = []): array
{
    return [
        'subject' => 'Customer satisfaction',
        'view_description' => 'Tell us how we did',
        'questions' => [
            ['type' => 'radio', 'question' => 'How happy are you?', 'required' => true, 'options' => [['description' => 'Happy'], ['description' => 'Unhappy']]],
            ['type' => 'checkbox', 'question' => 'What did you use?', 'options' => [['description' => 'ERP'], ['description' => 'CRM']]],
            ['type' => 'textarea', 'question' => 'Anything else?'],
        ],
        ...$overrides,
    ];
}

it('builds a survey, collects public answers and shows results', function () {
    $admin = signIn(companyAdmin());
    $survey = $this->postJson('/api/surveys', surveyPayload())->assertCreated()->json('data');
    [$radio, $checkbox, $text] = $survey['questions'];
    $path = "/api/public/surveys/{$survey['id']}/".Survey::find($survey['id'])->hash;

    auth()->forgetGuards();
    $this->getJson($path)->assertOk()->assertJsonCount(3, 'data.questions');
    $this->postJson($path, ['answers' => []])->assertJsonValidationErrors("answers.{$radio['id']}");
    $this->postJson($path, ['answers' => [
        $radio['id'] => $radio['options'][0]['id'],
        $checkbox['id'] => [$checkbox['options'][0]['id'], $checkbox['options'][1]['id']],
        $text['id'] => 'Great support',
    ]])->assertCreated();
    $this->postJson($path, ['answers' => [$radio['id'] => $radio['options'][1]['id']]])->assertCreated();
    $this->getJson('/api/public/surveys/'.$survey['id'].'/wronghash')->assertNotFound();

    signIn($admin);
    $results = $this->getJson("/api/surveys/{$survey['id']}/results")->assertOk()->assertJsonPath('data.participants', 2)->json('data.questions');
    expect($results[0]['options'][0]['count'])->toBe(1)->and($results[0]['options'][0]['percent'])->toEqual(50)
        ->and($results[1]['options'][1]['count'])->toBe(1)
        ->and($results[2]['answers'])->toBe(['Great support']);
});

it('keeps answered questions and edits the list in place', function () {
    signIn(companyAdmin());
    $survey = $this->postJson('/api/surveys', surveyPayload())->json('data');
    $q = $survey['questions'];
    $this->putJson("/api/surveys/{$survey['id']}", surveyPayload(['questions' => [
        ['id' => $q[2]['id'], 'type' => 'textarea', 'question' => 'Any comments?'],
        ['type' => 'input', 'question' => 'Your city', 'required' => true],
    ]]))->assertOk()->assertJsonCount(2, 'data.questions')->assertJsonPath('data.questions.0.id', $q[2]['id'])->assertJsonPath('data.questions.0.question', 'Any comments?');
    $this->putJson("/api/surveys/{$survey['id']}", surveyPayload(['questions' => [['type' => 'radio', 'question' => 'x']]]))->assertUnprocessable();
});

it('restricts by ip, hides inactive surveys and sends e-mails to the chosen lists', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $survey = $this->postJson('/api/surveys', surveyPayload(['ip_restrict' => true, 'questions' => [['type' => 'input', 'question' => 'Name']]]))->json('data');
    $hash = Survey::find($survey['id'])->hash;
    $customer = Customer::factory()->create(['company_id' => $admin->company_id]);
    Contact::create(['customer_id' => $customer->id, 'first_name' => 'A', 'email' => 'contact@x.test', 'is_primary' => true, 'active' => true]);
    $list = $this->postJson('/api/mail-lists', ['name' => 'Newsletter'])->assertCreated()->json('data.id');
    $this->postJson("/api/mail-lists/{$list}/emails", ['emails' => "a@x.test, b@x.test\ncontact@x.test\nnot-an-email"])->assertJsonPath('added', 3);

    $this->postJson("/api/surveys/{$survey['id']}/send", [])->assertUnprocessable();
    $this->postJson("/api/surveys/{$survey['id']}/send", ['customers' => true, 'mail_list_ids' => [$list]])->assertOk();
    expect(SurveySendLog::first()->total)->toBe(3)->and(SurveySendLog::first()->finished)->toBeTrue();
    Mail::assertSent(SurveyInvitation::class, 3);

    auth()->forgetGuards();
    $this->postJson("/api/public/surveys/{$survey['id']}/{$hash}", ['answers' => []])->assertCreated();
    $this->postJson("/api/public/surveys/{$survey['id']}/{$hash}", ['answers' => []])->assertForbidden();

    Survey::find($survey['id'])->update(['active' => false]);
    $this->getJson("/api/public/surveys/{$survey['id']}/{$hash}")->assertNotFound();
});

it('needs the surveys permission', function () {
    $admin = companyAdmin();
    signIn(staffMember($admin->company));
    $this->getJson('/api/surveys')->assertForbidden();
    signIn(staffMember($admin->company, ['surveys.view']));
    $this->getJson('/api/surveys')->assertOk();
    $this->postJson('/api/surveys', surveyPayload())->assertForbidden();
});
