<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailLog;
use App\Models\ScheduledEmail;
use App\Services\DocumentMailer;
use App\Services\Emails;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Perfex "Send to Email" on invoices, estimates, proposals, credit notes and contracts: pick
 * the customer's contacts, add CC, optionally edit the template and attach the PDF. Invoices and
 * estimates can also be scheduled for later (Perfex "Schedule").
 */
class DocumentEmailController extends Controller
{
    /**
     * The recipients to choose from, the template to start with and any e-mail already scheduled.
     */
    public function preview(Request $request, string $type, int $id): JsonResponse
    {
        $document = $this->document($type, $id);
        $slug = DocumentMailer::slug($type, $document);
        $template = Emails::template($slug, (int) $document->company_id);
        $schedule = in_array($type, DocumentMailer::SCHEDULABLE, true) ? $this->schedule($type, $document) : null;

        return response()->json(['data' => [
            'recipients' => DocumentMailer::recipients($type, $document)->values(),
            'template' => ['slug' => $slug, 'name' => $template?->name, 'subject' => $template?->subject, 'message' => $template?->message, 'active' => $template?->active],
            'already_sent' => (bool) $document->getAttribute('sent'),
            'can_schedule' => in_array($type, DocumentMailer::SCHEDULABLE, true),
            'schedule' => $schedule?->only(['id', 'scheduled_at', 'recipients', 'cc', 'attach_pdf', 'subject', 'message']),
            'logs' => EmailLog::where('rel_type', strtolower(class_basename($document)))->where('rel_id', $document->getKey())->latest('id')->limit(10)
                ->get(['id', 'to', 'subject', 'status', 'error', 'created_at']),
        ]]);
    }

    /**
     * Sends now, or with scheduled_at (invoices and estimates) keeps the e-mail for the scheduler;
     * a document has at most one scheduled e-mail, which a new schedule replaces.
     */
    public function send(Request $request, string $type, int $id): JsonResponse
    {
        $document = $this->document($type, $id);
        $data = $request->validate([
            'recipients' => ['required', 'array', 'min:1', 'max:50'],
            'recipients.*' => ['required', 'email'],
            'cc' => ['nullable', 'string', 'max:1000'],
            'attach_pdf' => ['boolean'],
            'subject' => ['nullable', 'string', 'max:500'],
            'message' => ['nullable', 'string', 'max:200000'],
            'scheduled_at' => ['nullable', 'date', 'after:now'],
        ]);

        if (! empty($data['scheduled_at'])) {
            abort_unless(in_array($type, DocumentMailer::SCHEDULABLE, true), 422, 'Only invoice and estimate e-mails can be scheduled.');
            $at = Carbon::parse($data['scheduled_at'])->utc();
            ScheduledEmail::updateOrCreate(['rel_type' => $type, 'rel_id' => $document->getKey()], [
                'company_id' => $document->company_id,
                'scheduled_at' => $at,
                'recipients' => array_values(array_unique(array_map('strtolower', $data['recipients']))),
                'cc' => $data['cc'] ?? null,
                'attach_pdf' => $data['attach_pdf'] ?? true,
                'subject' => $data['subject'] ?? null,
                'message' => $data['message'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            return response()->json(['message' => 'E-mail scheduled for '.$at->copy()->setTimezone('Asia/Kolkata')->format('d M Y, h:i A').'.']);
        }

        $count = DocumentMailer::deliver($type, $document, $data);
        // Sent by hand: a waiting scheduled e-mail is no longer needed.
        ScheduledEmail::where('rel_type', $type)->where('rel_id', $document->getKey())->delete();

        return response()->json(['message' => "E-mail sent to {$count} recipient(s)."]);
    }

    public function cancelSchedule(string $type, int $id): JsonResponse
    {
        $document = $this->document($type, $id);
        ScheduledEmail::where('rel_type', $type)->where('rel_id', $document->getKey())->delete();

        return response()->json(['message' => 'Scheduled e-mail cancelled.']);
    }

    private function document(string $type, int $id): Model
    {
        abort_unless(isset(DocumentMailer::TYPES[$type]), 404);
        $document = DocumentMailer::TYPES[$type][0]::findOrFail($id);
        $this->authorize('view', $document);

        return $document;
    }

    private function schedule(string $type, Model $document): ?ScheduledEmail
    {
        return ScheduledEmail::where('rel_type', $type)->where('rel_id', $document->getKey())->first();
    }
}
