<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Proposal;
use App\Models\Task;
use App\Models\Ticket;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The header's quick search (Ctrl+K): a few matches from each kind of record the user may open,
 * using the same visibility rules as the lists.
 */
class SearchController extends Controller
{
    private const PER_GROUP = 5;

    public function __invoke(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['data' => []]);
        }
        $user = $request->user();
        $like = '%'.addcslashes($q, '%_\\').'%';
        // "INV-000012", "#12" or "12" → number 12 for documents.
        $number = preg_match('/(\d+)\s*$/', $q, $m) ? (int) $m[1] : null;

        $groups = [];

        if ($user->can('viewAny', Project::class)) {
            $groups['projects'] = Project::query()->visibleTo($user)->with('customer:id,name')
                ->where(fn (Builder $w) => $w->where('name', 'like', $like)->when($number, fn ($w) => $w->orWhere('id', $number)))
                ->latest('id')->limit(self::PER_GROUP)->get()
                ->map(fn (Project $p) => $this->hit($p->id, "#{$p->id} {$p->name}", $p->customer?->name, "/projects/{$p->id}"));
        }

        $groups['tasks'] = Task::query()->visibleTo($user)->with('project:id,name')
            ->where(fn (Builder $w) => $w->where('name', 'like', $like)->when($number, fn ($w) => $w->orWhere('id', $number)))
            ->latest('id')->limit(self::PER_GROUP)->get()
            ->map(fn (Task $t) => $this->hit($t->id, "#{$t->id} {$t->name}", $t->project?->name, null));

        if ($user->can('viewAny', Customer::class)) {
            $groups['customers'] = Customer::query()
                ->where(fn (Builder $w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)->orWhere('vat', 'like', $like))
                ->orderBy('name')->limit(self::PER_GROUP)->get()
                ->map(fn (Customer $c) => $this->hit($c->id, $c->name, collect([$c->city, $c->phone])->filter()->implode(' · ') ?: null, "/customers/{$c->id}"));

            $groups['contacts'] = Contact::query()->with('customer:id,name')
                ->whereHas('customer')
                ->where(fn (Builder $w) => $w->whereRaw("CONCAT(first_name, ' ', last_name) like ?", [$like])->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like))
                ->orderBy('first_name')->limit(self::PER_GROUP)->get()
                ->map(fn (Contact $c) => $this->hit($c->id, trim("{$c->first_name} {$c->last_name}"), collect([$c->customer?->name, $c->email])->filter()->implode(' · '), "/customers/{$c->customer_id}?tab=contacts"));
        }

        if ($user->can('viewAny', Lead::class)) {
            $groups['leads'] = Lead::query()->visibleTo($user)
                ->where(fn (Builder $w) => $w->where('name', 'like', $like)->orWhere('company', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like))
                ->latest('id')->limit(self::PER_GROUP)->get()
                ->map(fn (Lead $l) => $this->hit($l->id, "#{$l->id} {$l->name}", $l->company, "/leads?lead={$l->id}"));
        }

        foreach ([['invoices', Invoice::class], ['estimates', Estimate::class]] as [$key, $model]) {
            if ($user->can('viewAny', $model)) {
                $groups[$key] = $model::query()->visibleTo($user)->with('customer:id,name')
                    ->where(fn (Builder $w) => $w->whereHas('customer', fn ($c) => $c->where('name', 'like', $like))->when($number, fn ($w) => $w->orWhere('number', $number)))
                    ->latest('id')->limit(self::PER_GROUP)->get()
                    ->map(fn ($d) => $this->hit($d->id, $d->formattedNumber(), $d->customer?->name, "/{$key}/{$d->id}"));
            }
        }

        if ($user->can('viewAny', Proposal::class)) {
            $groups['proposals'] = Proposal::query()->visibleTo($user)
                ->where(fn (Builder $w) => $w->where('subject', 'like', $like)->orWhere('proposal_to', 'like', $like)->when($number, fn ($w) => $w->orWhere('id', $number)))
                ->latest('id')->limit(self::PER_GROUP)->get()
                ->map(fn (Proposal $p) => $this->hit($p->id, $p->formattedNumber().' '.$p->subject, $p->proposal_to, "/proposals/{$p->id}"));
        }

        if ($user->can('viewAny', Ticket::class)) {
            $groups['tickets'] = Ticket::query()->visibleTo($user)->with('customer:id,name')
                ->where(fn (Builder $w) => $w->where('subject', 'like', $like)->when($number, fn ($w) => $w->orWhere('id', $number)))
                ->latest('id')->limit(self::PER_GROUP)->get()
                ->map(fn (Ticket $t) => $this->hit($t->id, "#{$t->id} {$t->subject}", $t->customer?->name, "/tickets/{$t->id}"));
        }

        if ($user->can('viewAny', Contract::class)) {
            $groups['contracts'] = Contract::query()->visibleTo($user)->with('customer:id,name')->where('trash', false)
                ->where('subject', 'like', $like)
                ->latest('id')->limit(self::PER_GROUP)->get()
                ->map(fn (Contract $c) => $this->hit($c->id, $c->subject, $c->customer?->name, "/contracts/{$c->id}"));
        }

        return response()->json(['data' => collect($groups)->filter(fn ($rows) => $rows->isNotEmpty())->map->values()]);
    }

    /** @return array{id: int, title: string, subtitle: ?string, url: ?string} */
    private function hit(int $id, string $title, ?string $subtitle, ?string $url): array
    {
        return ['id' => $id, 'title' => $title, 'subtitle' => $subtitle ?: null, 'url' => $url];
    }
}
