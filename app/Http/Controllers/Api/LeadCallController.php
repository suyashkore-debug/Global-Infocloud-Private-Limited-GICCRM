<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadCall;
use App\Models\Reminder;
use App\Services\Exotel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * The Call tab of a lead: call the lead's number and log each call (outcome, duration, notes),
 * with an optional follow-up reminder. With Exotel set up (Setup → Calls), "Call now" places the
 * call through Exotel and calls are logged automatically with their recording.
 */
class LeadCallController extends Controller
{
    public function __construct(private Exotel $exotel) {}

    public function index(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('view', $lead);

        $company = (int) $lead->company_id;

        return response()->json([
            'data' => $lead->calls()->with('user')->get()->map(fn (LeadCall $c) => $this->row($c, $request)),
            'meta' => [
                'phone' => $lead->phone,
                'outcomes' => LeadCall::OUTCOMES,
                'labels' => LeadCall::labels(),
                'can_log' => $request->user()->can('update', $lead),
                // Exotel set up: "Call now" rings my_number first, then the lead.
                'provider' => Exotel::configured($company) ? 'exotel' : null,
                'my_number' => Exotel::configured($company) ? Exotel::numberFor($request->user()) : null,
            ],
        ]);
    }

    public function store(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);
        $data = $request->validate([
            ...$this->rules(),
            'follow_up_at' => ['nullable', 'date', 'after:now'],
        ]);

        $call = $lead->calls()->create([
            ...collect($data)->except('follow_up_at')->all(),
            'user_id' => $request->user()->id,
        ]);

        // A call that reached the lead counts as contact (Leads → "Last Contact").
        if (in_array($call->outcome, ['answered', 'callback'], true) && (! $lead->last_contact_at || $call->called_at->gt($lead->last_contact_at))) {
            $lead->update(['last_contact_at' => $call->called_at]);
        }
        $lead->logActivity('Logged a call: '.LeadCall::OUTCOMES[$call->outcome].($call->duration_minutes ? " ({$call->duration_minutes} min)" : ''));

        if (! empty($data['follow_up_at'])) {
            Reminder::create([
                'remindable_type' => Lead::class,
                'remindable_id' => $lead->id,
                'user_id' => $request->user()->id,
                'remind_at' => Carbon::parse($data['follow_up_at']),
                'description' => "Follow-up call with {$lead->name}",
                'created_by' => $request->user()->id,
            ]);
        }

        return response()->json(['data' => $this->row($call->load('user'), $request)], 201);
    }

    /**
     * Correct a logged call: only the person who logged it, or an admin.
     */
    public function update(Request $request, Lead $lead, LeadCall $call): JsonResponse
    {
        $this->authorize('update', $lead);
        abort_unless($call->lead_id === $lead->id, 404);
        abort_unless($this->canEdit($call, $request), 403);

        $call->update($request->validate([...$this->rules(), 'outcome' => ['required', Rule::in(array_keys(LeadCall::labels()))]]));

        return response()->json(['data' => $this->row($call->load('user'), $request)]);
    }

    /**
     * Call now through Exotel: the staff member's mobile rings first, then the lead's.
     */
    public function dial(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);
        abort_unless(Exotel::configured((int) $lead->company_id), 422, 'Calling is not set up yet. An admin can connect Exotel in Setup → Calls.');

        try {
            $call = $this->exotel->dial($lead, $request->user());
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $this->row($call->load('user'), $request), 'message' => 'Calling… your phone will ring first.'], 201);
    }

    public function recording(Lead $lead, LeadCall $call): Response
    {
        $this->authorize('view', $lead);
        abort_unless($call->lead_id === $lead->id, 404);
        $audio = $this->exotel->recording($call);
        abort_unless($audio !== null, 404, 'The recording is not available.');

        return response($audio, 200, [
            'Content-Type' => 'audio/mpeg',
            'Content-Disposition' => "inline; filename=\"call-{$call->id}.mp3\"",
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(): array
    {
        return [
            'direction' => ['required', Rule::in(['out', 'in'])],
            'outcome' => ['required', Rule::in(array_keys(LeadCall::OUTCOMES))],
            'called_at' => ['required', 'date', 'before_or_equal:'.now()->addMinutes(5)->toDateTimeString()],
            'duration_minutes' => ['nullable', 'integer', 'min:0', 'max:600'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    private function canEdit(LeadCall $call, Request $request): bool
    {
        return (int) $call->user_id === (int) $request->user()->id || $request->user()->isAdmin();
    }

    /**
     * @return array<string, mixed>
     */
    private function row(LeadCall $c, Request $request): array
    {
        return [
            'id' => $c->id,
            'direction' => $c->direction,
            'outcome' => $c->outcome,
            'called_at' => $c->called_at,
            'duration_minutes' => $c->duration_minutes,
            'talk_seconds' => $c->talk_seconds,
            'source' => $c->source,
            'has_recording' => (bool) $c->recording_url,
            'notes' => $c->notes,
            'user' => $c->user?->full_name,
            'can_edit' => $this->canEdit($c, $request),
        ];
    }
}
