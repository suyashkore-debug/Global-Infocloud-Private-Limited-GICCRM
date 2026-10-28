<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Http\Resources\NoteResource;
use App\Http\Resources\ReminderResource;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Lead;
use App\Models\Note;
use App\Models\Reminder;
use App\Models\Ticket;
use App\Services\LeadService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Notes, reminders and file attachments on any record (lead, customer, contract, ticket, expense),
 * like Perfex's tabs on those pages. Reading needs view rights on the record, writing update rights.
 */
class RecordExtrasController extends Controller
{
    /** @var array<string, class-string<Model>> */
    private const TYPES = [
        'lead' => Lead::class,
        'customer' => Customer::class,
        'contract' => Contract::class,
        'ticket' => Ticket::class,
        'expense' => Expense::class,
    ];

    public function notes(string $type, int $id): AnonymousResourceCollection
    {
        $record = $this->record($type, $id, 'view');

        return NoteResource::collection(Note::where('notable_type', $record::class)->where('notable_id', $record->id)->with('creator')->latest()->get());
    }

    public function addNote(Request $request, string $type, int $id, LeadService $leads): JsonResponse
    {
        $record = $this->record($type, $id, $type === 'customer' ? 'view' : 'update');
        $data = $request->validate([
            'description' => ['required', 'string', 'max:65000'],
            'contacted_at' => ['nullable', 'date'],
        ]);

        if ($record instanceof Lead) {
            $leads->addNote($record, $data['description'], $data['contacted_at'] ?? null);
            $note = $record->notes()->first();
        } else {
            $note = Note::create([
                'notable_type' => $record::class,
                'notable_id' => $record->id,
                'description' => $data['description'],
                'contacted_at' => $data['contacted_at'] ?? null,
                'created_by' => $request->user()->id,
            ]);
        }

        return (new NoteResource($note->load('creator')))->response()->setStatusCode(201);
    }

    public function deleteNote(Request $request, Note $note): JsonResponse
    {
        abort_unless((int) $note->created_by === (int) $request->user()->id || $request->user()->isAdmin(), 403);
        $note->delete();

        return response()->json(['message' => 'Note deleted.']);
    }

    public function reminders(Request $request, string $type, int $id): AnonymousResourceCollection
    {
        $record = $this->record($type, $id, 'view');

        return ReminderResource::collection(Reminder::where('remindable_type', $record::class)->where('remindable_id', $record->id)->with('user')->orderBy('remind_at')->get());
    }

    public function addReminder(Request $request, string $type, int $id): ReminderResource
    {
        $record = $this->record($type, $id, 'view');
        $data = $request->validate([
            'remind_at' => ['required', 'date', 'after:now'],
            'description' => ['nullable', 'string', 'max:5000'],
            'user_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $request->user()->company_id)],
            'notify_by_email' => ['boolean'],
        ]);

        $reminder = Reminder::create([
            'remindable_type' => $record::class,
            'remindable_id' => $record->id,
            'user_id' => $data['user_id'] ?? $request->user()->id,
            'remind_at' => $data['remind_at'],
            'description' => $data['description'] ?? null,
            'notify_by_email' => (bool) ($data['notify_by_email'] ?? false),
            'created_by' => $request->user()->id,
        ]);

        return new ReminderResource($reminder->load('user'));
    }

    public function deleteReminder(Request $request, Reminder $reminder): JsonResponse
    {
        abort_unless(in_array((int) $request->user()->id, [(int) $reminder->user_id, (int) $reminder->created_by], true) || $request->user()->isAdmin(), 403);
        $reminder->delete();

        return response()->json(['message' => 'Reminder deleted.']);
    }

    public function upload(Request $request, string $type, int $id): JsonResponse
    {
        $record = $this->record($type, $id, 'update');
        $request->validate([
            'files' => ['required', 'array', 'max:10'],
            'files.*' => ['file', 'max:20480'],
        ]);

        $saved = collect($request->file('files'))->map(fn ($file) => $record->attachments()->create([
            'user_id' => $request->user()->id,
            'disk_path' => $file->store('attachments/'.$request->user()->company_id.'/'.$type.'s/'.$record->id, 'local'),
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'project_id' => $record->project_id ?? null,
        ]));

        if ($record instanceof Lead) {
            $record->logActivity('Uploaded attachment');
        }

        return AttachmentResource::collection($saved->each->load('user'))->response()->setStatusCode(201);
    }

    private function record(string $type, int $id, string $ability): Model
    {
        abort_unless(isset(self::TYPES[$type]), 404);
        $record = self::TYPES[$type]::findOrFail($id);
        $this->authorize($ability, $record);

        return $record;
    }
}
