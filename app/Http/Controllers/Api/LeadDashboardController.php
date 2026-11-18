<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadCall;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\User;
use App\Services\DefaultLookups;
use App\Support\CompanyTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Leads → Dashboard: how the leads are doing over a period (new, converted, contacted, by source
 * and day), the pipeline right now, follow-ups that are due, and each staff member's numbers.
 * Everyone sees the leads they may see (Perfex lead visibility); days are the company's days.
 */
class LeadDashboardController extends Controller
{
    public const PERIODS = ['today', '7d', '30d', 'this_month', 'this_year'];

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['period' => ['nullable', Rule::in(self::PERIODS)]]);
        DefaultLookups::ensureLeadLists();
        $user = $request->user();
        $zone = CompanyTime::zone();
        [$from, $to, $prevFrom, $prevTo] = $this->range($data['period'] ?? '30d', CarbonImmutable::now($zone));
        $utc = fn (CarbonImmutable $d) => $d->utc();
        $visible = fn () => Lead::query()->visibleTo($user)->inWorkspace($user);
        $between = fn (Builder $q, string $column, CarbonImmutable $a, CarbonImmutable $b) => $q->where($column, '>=', $utc($a))->where($column, '<', $utc($b));

        $created = $between($visible(), 'created_at', $from, $to)->get(['id', 'lead_source_id', 'customer_id', 'created_at']);
        $converted = $between($visible()->whereNotNull('customer_id'), 'converted_at', $from, $to)->get(['id', 'lead_source_id', 'assigned_id', 'converted_at']);
        $newPrev = $between($visible(), 'created_at', $prevFrom, $prevTo)->count();
        $convertedPrev = $between($visible()->whereNotNull('customer_id'), 'converted_at', $prevFrom, $prevTo)->count();
        $contacted = $between($visible(), 'last_contact_at', $from, $to)->count();
        $open = $visible()->where('lost', false)->where('junk', false)->whereNull('customer_id');
        $now = now();
        $endOfToday = $utc(CarbonImmutable::now($zone)->endOfDay());

        return response()->json(['data' => [
            // The workspace shown (picked in the header), when there are several.
            'workspace' => \App\Models\LeadPipeline::current($user)?->name,
            'period' => ['key' => $data['period'] ?? '30d', 'from' => $from->toDateString(), 'to' => $to->subSecond()->toDateString()],
            'kpis' => [
                'new' => $created->count(),
                'new_prev' => $newPrev,
                'converted' => $converted->count(),
                'converted_prev' => $convertedPrev,
                'contacted' => $contacted,
                'open' => (clone $open)->count(),
                'open_value' => (float) (clone $open)->sum('lead_value'),
                'overdue' => $visible()->whereNotNull('next_follow_up_at')->where('next_follow_up_at', '<', $now)->count(),
                'due_today' => $visible()->whereNotNull('next_follow_up_at')->whereBetween('next_follow_up_at', [$now, $endOfToday])->count(),
            ],
            'trend' => $this->trend($created, $converted, $from, $to, $zone),
            'sources' => LeadSource::forWorkspace()->orderBy('name')->get(['id', 'name'])->map(fn ($s) => [
                'source' => $s->name,
                'leads' => $created->where('lead_source_id', $s->id)->count(),
                'converted' => $converted->where('lead_source_id', $s->id)->count(),
            ])->filter(fn ($r) => $r['leads'] > 0 || $r['converted'] > 0)->sortByDesc('leads')->values(),
            'pipeline' => LeadStatus::inWorkspace($user)->orderBy('status_order')->get(['id', 'name', 'color'])->map(fn ($s) => [
                'id' => $s->id,
                'name' => $s->name,
                'color' => $s->color,
                'count' => (clone $open)->where('lead_status_id', $s->id)->count(),
                'value' => (float) (clone $open)->where('lead_status_id', $s->id)->sum('lead_value'),
            ])->values(),
            'follow_ups' => $visible()->whereNotNull('next_follow_up_at')->where('next_follow_up_at', '<', $endOfToday)
                ->with('assigned:id,full_name')->orderBy('next_follow_up_at')->limit(8)
                ->get(['id', 'name', 'company', 'phone', 'assigned_id', 'next_follow_up_at', 'follow_up_note'])
                ->map(fn (Lead $l) => [
                    'id' => $l->id, 'name' => $l->name, 'company' => $l->company, 'phone' => $l->phone,
                    'assigned' => $l->assigned?->full_name, 'at' => $l->next_follow_up_at, 'note' => $l->follow_up_note,
                ]),
            'team' => $this->team($user, $visible, $between, $from, $to, $converted),
        ]]);
    }

    /**
     * The period and the one before it, as [from, to) in the company's time.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: CarbonImmutable, 3: CarbonImmutable}
     */
    private function range(string $period, CarbonImmutable $now): array
    {
        $today = $now->startOfDay();
        [$from, $to] = match ($period) {
            'today' => [$today, $today->addDay()],
            '7d' => [$today->subDays(6), $today->addDay()],
            'this_month' => [$today->startOfMonth(), $today->addDay()],
            'this_year' => [$today->startOfYear(), $today->addDay()],
            default => [$today->subDays(29), $today->addDay()],
        };
        // The same length just before (this month → the same days of last month).
        [$prevFrom, $prevTo] = match ($period) {
            'this_month' => [$from->subMonthNoOverflow(), $to->subMonthNoOverflow()],
            'this_year' => [$from->subYear(), $to->subYear()],
            default => [$from->sub($from->diff($to)), $from],
        };

        return [$from, $to, $prevFrom, $prevTo];
    }

    /**
     * New and converted leads per day (per month for a year).
     *
     * @return array{labels: array<int, string>, new: array<int, int>, converted: array<int, int>}
     */
    private function trend($created, $converted, CarbonImmutable $from, CarbonImmutable $to, string $zone): array
    {
        $byMonth = $from->diffInDays($to) > 62;
        $key = fn ($date) => CarbonImmutable::parse($date)->setTimezone($zone)->format($byMonth ? 'Y-m' : 'Y-m-d');
        $slots = [];
        for ($d = $from; $d < $to; $d = $byMonth ? $d->addMonth() : $d->addDay()) {
            $slots[$d->format($byMonth ? 'Y-m' : 'Y-m-d')] = $d->format($byMonth ? 'M' : 'd M');
        }
        $newCounts = $created->groupBy(fn ($l) => $key($l->created_at))->map->count();
        $convCounts = $converted->groupBy(fn ($l) => $key($l->converted_at))->map->count();

        return [
            'labels' => array_values($slots),
            'new' => array_map(fn ($k) => (int) ($newCounts[$k] ?? 0), array_keys($slots)),
            'converted' => array_map(fn ($k) => (int) ($convCounts[$k] ?? 0), array_keys($slots)),
        ];
    }

    /**
     * Each staff member with leads: their open leads, those assigned in the period, contacted,
     * converted, overdue follow-ups and calls logged.
     *
     * @return array<int, array<string, mixed>>
     */
    private function team(User $user, callable $visible, callable $between, CarbonImmutable $from, CarbonImmutable $to, $converted): array
    {
        $staff = User::where('company_id', $user->company_id)->where('is_active', true)->get(['id', 'full_name', 'profile_photo']);
        $count = fn (Builder $q) => $q->whereNotNull('assigned_id')->selectRaw('assigned_id, count(*) as n')->groupBy('assigned_id')->pluck('n', 'assigned_id');
        $open = $count($visible()->where('lost', false)->where('junk', false)->whereNull('customer_id'));
        $assigned = $count($visible()->where('assigned_at', '>=', $from->toDateString())->where('assigned_at', '<', $to->toDateString()));
        $contacted = $count($between($visible(), 'last_contact_at', $from, $to));
        $overdue = $count($visible()->whereNotNull('next_follow_up_at')->where('next_follow_up_at', '<', now()));
        $conv = $converted->whereNotNull('assigned_id')->countBy('assigned_id');
        $calls = LeadCall::query()->whereIn('lead_id', $visible()->select('id'))
            ->where('called_at', '>=', $from->utc())->where('called_at', '<', $to->utc())
            ->selectRaw('user_id, count(*) as n')->groupBy('user_id')->pluck('n', 'user_id');

        return $staff->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->full_name,
            'photo_url' => $u->photoUrl(),
            'open' => (int) ($open[$u->id] ?? 0),
            'assigned' => (int) ($assigned[$u->id] ?? 0),
            'contacted' => (int) ($contacted[$u->id] ?? 0),
            'converted' => (int) ($conv[$u->id] ?? 0),
            'overdue' => (int) ($overdue[$u->id] ?? 0),
            'calls' => (int) ($calls[$u->id] ?? 0),
        ])->filter(fn ($r) => $r['open'] + $r['assigned'] + $r['contacted'] + $r['converted'] + $r['overdue'] + $r['calls'] > 0)
            ->sortByDesc(fn ($r) => [$r['converted'], $r['contacted'], $r['open']])->values()->all();
    }
}
