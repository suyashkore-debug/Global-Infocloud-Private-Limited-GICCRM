<?php

namespace App\Services;

use App\Enums\InvoiceStatus;
use App\Models\AppNotification;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Estimate;
use App\Models\Goal;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Payment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Goal progress exactly as Perfex's goals module computes it, per goal type.
 */
class GoalService
{
    /**
     * @return array{total: float, percent: float}
     */
    public function progress(Goal $goal): array
    {
        $from = $goal->start_date->toDateString();
        $to = $goal->end_date->toDateString();
        $staff = $goal->staff_id;
        $company = $goal->company_id;

        $total = match ((int) $goal->goal_type) {
            1 => (float) Payment::withoutGlobalScopes()->where('company_id', $company)->whereBetween('date', [$from, $to])
                ->when($staff, fn (Builder $q) => $q->whereHas('invoice', fn ($i) => $i->withoutGlobalScopes()->where('sale_agent_id', $staff)))
                ->sum('amount'),
            8 => (float) Invoice::withoutGlobalScopes()->where('company_id', $company)->whereBetween('date', [$from, $to])
                ->when($staff, fn (Builder $q) => $q->where('sale_agent_id', $staff))
                ->sum('total'),
            2 => (float) Lead::withoutGlobalScopes()->where('company_id', $company)->whereNotNull('customer_id')->whereBetween(DB::raw('DATE(converted_at)'), [$from, $to])
                ->when($staff, fn (Builder $q) => $q->where(fn ($q) => $q->where('assigned_id', $staff)->orWhere(fn ($q) => $q->whereNull('assigned_id')->where('created_by', $staff))))
                ->count(),
            3, 4 => (float) Customer::withoutGlobalScopes()->where('company_id', $company)->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
                ->when((int) $goal->goal_type === 3, fn (Builder $q) => $q->whereNotIn('id', Lead::withoutGlobalScopes()->whereNotNull('customer_id')->select('customer_id')))
                ->when($staff, fn (Builder $q) => $q->where('created_by', $staff))
                ->count(),
            5, 7 => (float) Contract::withoutGlobalScopes()->where('company_id', $company)->where('trash', false)
                ->where('contract_type_id', $goal->contract_type_id)
                ->whereBetween((int) $goal->goal_type === 7 ? 'start_date' : DB::raw('DATE(created_at)'), [$from, $to])
                ->when($staff, fn (Builder $q) => $q->where('created_by', $staff))
                ->count(),
            6 => (float) Estimate::withoutGlobalScopes()->where('company_id', $company)->whereNotNull('invoice_id')->whereBetween(DB::raw('DATE(invoiced_at)'), [$from, $to])
                ->whereHas('invoice', fn ($i) => $i->withoutGlobalScopes()->where('status', '!=', InvoiceStatus::Cancelled))
                ->when($staff, fn (Builder $q) => $q->where(fn ($q) => $q->where('created_by', $staff)->orWhere('sale_agent_id', $staff)))
                ->count(),
            default => 0.0,
        };

        $target = (float) $goal->achievement;
        $percent = $target > 0 ? min(100, round($total * 100 / $target, 2)) : 0;

        return ['total' => round($total, 2), 'percent' => $percent];
    }

    /**
     * Daily: once a goal's end date passes, tell the staff member (or its creator) whether it was
     * achieved, if they asked for it (Perfex cron).
     */
    public function notifyFinished(): int
    {
        $count = 0;
        Goal::withoutGlobalScopes()->where('notified', false)->whereDate('end_date', '<', today())->each(function (Goal $goal) use (&$count) {
            $achieved = $this->progress($goal)['percent'] >= 100;
            if (($achieved && $goal->notify_when_achieve) || (! $achieved && $goal->notify_when_fail)) {
                AppNotification::create([
                    'company_id' => $goal->company_id,
                    'user_id' => $goal->staff_id ?: $goal->created_by,
                    'description' => ($achieved ? 'goal achieved: ' : 'goal failed: ').$goal->subject,
                    'link' => '/utilities/goals',
                ]);
                $count++;
            }
            $goal->update(['notified' => true]);
        });

        return $count;
    }
}
