<?php

namespace App\Models\Concerns;

use App\Support\CurrentCompany;
use Illuminate\Database\Eloquent\Builder;

/**
 * Keeps each HRMS company's data apart: queries only see the signed-in user's company and new
 * rows are stamped with it.
 */
trait BelongsToCompany
{
    public static function bootBelongsToCompany(): void
    {
        static::addGlobalScope('company', function (Builder $query) {
            if ($companyId = CurrentCompany::id()) {
                $query->where($query->getModel()->qualifyColumn('company_id'), $companyId);
            }
        });

        static::creating(function ($model) {
            $model->company_id ??= CurrentCompany::id();
        });
    }
}
