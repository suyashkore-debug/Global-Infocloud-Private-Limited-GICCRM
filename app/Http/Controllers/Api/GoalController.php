<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Goal;
use App\Services\GoalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Utilities → Goals with their live progress.
 */
class GoalController extends Controller
{
    public function __construct(private GoalService $goals) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->hasPermission('goals', 'view') || Goal::where('staff_id', $user->id)->exists(), 403);

        $goals = Goal::query()
            ->unless($user->hasPermission('goals', 'view'), fn ($q) => $q->where('staff_id', $user->id))
            ->with(['staff', 'contractType'])
            ->latest('end_date')
            ->get()
            ->map(fn (Goal $g) => $this->present($g));

        return response()->json(['data' => $goals, 'meta' => ['types' => collect(Goal::TYPES)->map(fn ($name, $id) => ['id' => $id, 'name' => $name])->values()]]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('goals', 'create'), 403);
        $goal = Goal::create([...$this->validated($request), 'created_by' => $request->user()->id]);

        return response()->json(['data' => $this->present($goal->load(['staff', 'contractType']))], 201);
    }

    public function update(Request $request, Goal $goal): JsonResponse
    {
        abort_unless($request->user()->hasPermission('goals', 'edit'), 403);
        $data = $this->validated($request);
        // A new end date in the future can notify again (Perfex resets "notified").
        if ($data['end_date'] >= today()->toDateString()) {
            $data['notified'] = false;
        }
        $goal->update($data);

        return response()->json(['data' => $this->present($goal->load(['staff', 'contractType']))]);
    }

    public function destroy(Request $request, Goal $goal): JsonResponse
    {
        abort_unless($request->user()->hasPermission('goals', 'delete'), 403);
        $goal->delete();

        return response()->json(['message' => 'Goal deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Goal $goal): array
    {
        return [
            ...$goal->only(['id', 'subject', 'description', 'goal_type', 'achievement', 'notify_when_fail', 'notify_when_achieve', 'staff_id', 'contract_type_id']),
            'start_date' => $goal->start_date->toDateString(),
            'end_date' => $goal->end_date->toDateString(),
            'type_name' => Goal::TYPES[$goal->goal_type] ?? '',
            'staff' => $goal->staff?->full_name,
            'contract_type' => $goal->contractType?->name,
            'progress' => $this->goals->progress($goal),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $company = $request->user()->company_id;

        return $request->validate([
            'subject' => ['required', 'string', 'max:400'],
            'description' => ['nullable', 'string', 'max:5000'],
            'goal_type' => ['required', 'integer', Rule::in(array_keys(Goal::TYPES))],
            'contract_type_id' => ['nullable', 'required_if:goal_type,5,7', 'integer', Rule::exists('contract_types', 'id')->where('company_id', $company)],
            'achievement' => ['required', 'numeric', 'gt:0'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'staff_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)],
            'notify_when_fail' => ['boolean'],
            'notify_when_achieve' => ['boolean'],
        ]);
    }
}
