<?php

namespace App\Http\Controllers\Api\Purchase;

use App\Models\PurchaseApproval;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Line validation and presenters shared by purchase requests, orders and invoices.
 */
trait PurchaseHelpers
{
    /**
     * @return array<string, mixed>
     */
    protected function lineRules(Request $request): array
    {
        $company = $request->user()->company_id;

        return [
            'items' => ['required', 'array', 'min:1', 'max:300'],
            'items.*.item_id' => ['nullable', 'integer', Rule::exists('items', 'id')->where('company_id', $company)],
            'items.*.description' => ['required', 'string', 'max:500'],
            'items.*.long_description' => ['nullable', 'string', 'max:5000'],
            'items.*.unit' => ['nullable', 'string', 'max:40'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.tax_id' => ['nullable', 'integer', Rule::exists('taxes', 'id')->where('company_id', $company)],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function moneyRules(): array
    {
        return [
            'discount_type' => ['nullable', Rule::in(['percent', 'fixed'])],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_total' => ['nullable', 'numeric', 'min:0'],
            'shipping_fee' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function lines(Model $document): array
    {
        return $document->items->map(fn ($i) => [
            'id' => $i->id, 'item_id' => $i->item_id, 'description' => $i->description, 'long_description' => $i->long_description, 'unit' => $i->unit,
            'qty' => (float) $i->qty, 'unit_price' => (float) $i->unit_price, 'tax_name' => $i->tax_name, 'tax_rate' => (float) $i->tax_rate,
            'tax_value' => (float) $i->tax_value, 'total' => (float) $i->total,
        ])->all();
    }

    /**
     * Approval rows with names, and whether the signed-in user still has to decide.
     *
     * @return array<string, mixed>
     */
    protected function approvalInfo(Model $document, User $me): array
    {
        $approvals = $document->approvals()->get();
        $names = User::whereIn('id', $approvals->pluck('staff_id'))->pluck('full_name', 'id');

        return [
            'approvals' => $approvals->map(fn (PurchaseApproval $a) => [
                'staff' => $names[$a->staff_id] ?? null, 'staff_id' => $a->staff_id, 'decision' => $a->decision, 'note' => $a->note,
                'decided_at' => $a->decided_at?->toIso8601String(),
            ])->values(),
            'awaiting_my_decision' => $approvals->contains(fn ($a) => (int) $a->staff_id === (int) $me->id && $a->decision === null),
        ];
    }

    protected function isApprover(Model $document, User $user): bool
    {
        return $document->approvals()->where('staff_id', $user->id)->exists();
    }

    protected function staffName(?int $id): ?string
    {
        return $id ? User::find($id)?->full_name : null;
    }
}
