<?php

use App\Enums\EstimateStatus;
use App\Jobs\SendTemplateEmail;
use App\Mail\TemplateMail;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\EmailLog;
use App\Models\EmailTemplate;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Services\Emails;
use App\Services\Options;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;

function customerWithContact(int $companyId): Customer
{
    $customer = Customer::factory()->create(['company_id' => $companyId, 'name' => 'Acme Ltd']);
    Contact::create(['customer_id' => $customer->id, 'first_name' => 'Ravi', 'email' => 'ravi@acme.test', 'is_primary' => true, 'active' => true]);
    Contact::create(['customer_id' => $customer->id, 'first_name' => 'Noemail', 'email' => 'no@acme.test', 'active' => true, 'invoice_emails' => false]);

    return $customer;
}

it('sends an invoice with its pdf, merges fields and marks it sent', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    Options::set('company_name', 'GIC');
    $invoice = Invoice::factory()->create(['customer_id' => customerWithContact($admin->company_id)->id, 'total' => 1180]);

    $preview = $this->getJson("/api/invoices/{$invoice->id}/email")->assertOk()->json('data');
    expect(collect($preview['recipients'])->firstWhere('email', 'ravi@acme.test')['checked'])->toBeTrue()
        ->and(collect($preview['recipients'])->firstWhere('email', 'no@acme.test')['checked'])->toBeFalse()
        ->and($preview['template']['slug'])->toBe('invoice-send-to-client');

    $this->postJson("/api/invoices/{$invoice->id}/email", ['recipients' => ['ravi@acme.test'], 'cc' => 'boss@gic.test', 'attach_pdf' => true])->assertOk();

    Mail::assertSent(TemplateMail::class, function (TemplateMail $mail) use ($invoice) {
        return $mail->hasTo('ravi@acme.test') && $mail->hasCc('boss@gic.test')
            && str_contains($mail->mailSubject, $invoice->formattedNumber())
            && str_contains($mail->body, 'Ravi') && str_contains($mail->body, "/invoice/{$invoice->id}/{$invoice->hash}")
            && count($mail->files) === 1 && str_ends_with($mail->files[0]['name'], '.pdf');
    });
    expect($invoice->refresh()->sent)->toBeTrue()
        ->and(EmailLog::first()->status)->toBe('sent')
        ->and($this->getJson("/api/invoices/{$invoice->id}/email")->json('data.template.slug'))->toBe('invoice-already-send');
});

it('marks a draft estimate sent and lets the subject and message be edited', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $id = $this->postJson('/api/estimates', ['customer_id' => customerWithContact($admin->company_id)->id, 'date' => today()->toDateString(), 'status' => EstimateStatus::Draft->value,
        'items' => [['description' => 'ERP', 'qty' => 1, 'rate' => 1000]]])->assertCreated()->json('data.id');
    $estimate = Estimate::find($id);

    $this->postJson("/api/estimates/{$estimate->id}/email", [
        'recipients' => ['ravi@acme.test'], 'attach_pdf' => false, 'subject' => 'Your quote {estimate_number}', 'message' => 'Hi {contact_firstname} <script>x</script>',
    ])->assertOk();

    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => $m->mailSubject === 'Your quote '.$estimate->formattedNumber() && str_contains($m->body, 'Hi Ravi') && $m->files === []);
    expect($estimate->refresh()->status)->toBe(EstimateStatus::Sent);
});

it('sends a contract with a contract pdf', function () {
    Mail::fake();
    $admin = signIn(companyAdmin());
    $contract = Contract::create(['company_id' => $admin->company_id, 'subject' => 'AMC 2027', 'customer_id' => customerWithContact($admin->company_id)->id,
        'start_date' => '2027-01-01', 'content' => 'Terms', 'hash' => str_repeat('a', 32), 'created_by' => $admin->id]);

    $this->get("/api/contracts/{$contract->id}/pdf")->assertOk()->assertHeader('content-type', 'application/pdf');
    $this->postJson("/api/contracts/{$contract->id}/email", ['recipients' => ['ravi@acme.test']])->assertOk();
    Mail::assertSent(TemplateMail::class, fn (TemplateMail $m) => str_contains($m->mailSubject, 'AMC 2027') && count($m->files) === 1);
});

it('skips inactive templates for automatic e-mails and escapes merged values', function () {
    Queue::fake();
    $admin = signIn(companyAdmin());
    Emails::ensureTemplates($admin->company_id);
    EmailTemplate::where('slug', 'new-lead-assigned')->update(['active' => false]);

    expect(Emails::send('new-lead-assigned', $admin->company_id, 'a@x.test', []))->toBeNull()
        ->and(Emails::send('new-lead-assigned', $admin->company_id, 'a@x.test', [], ['force' => true]))->not->toBeNull();

    $template = EmailTemplate::where('slug', 'task-commented')->first();
    $out = Emails::render($template, ['task_name' => '<b>x</b>', 'task_comment' => "a\nb"], $admin->company_id);
    expect($out['html'])->toContain('&lt;b&gt;x&lt;/b&gt;')->not->toContain('{task_name}');
    Queue::assertPushed(SendTemplateEmail::class, 1);
});

it('lets only admins change e-mail settings and keeps the smtp password secret', function () {
    $admin = companyAdmin();
    signIn(staffMember($admin->company));
    $this->getJson('/api/settings/email')->assertForbidden();

    signIn($admin);
    $this->putJson('/api/settings/email', ['smtp_host' => 'smtp.gmail.com', 'smtp_port' => 587, 'smtp_encryption' => 'tls', 'smtp_username' => 'me@gic.test', 'smtp_password' => 'secret', 'smtp_email' => 'me@gic.test'])
        ->assertOk()->assertJsonPath('data.has_password', true)->assertJsonMissingPath('data.smtp_password');
    expect(Options::get('smtp_password'))->not->toBe('secret')->not->toBe('');
    $this->getJson('/api/email-templates')->assertOk()->assertJsonPath('meta.merge_fields.invoice.0', 'invoice_number');
});
