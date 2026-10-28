<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * Exists rules limited to the signed-in user's company, so ids from another company are rejected.
 */
trait CompanyRules
{
    protected function companyId(): int
    {
        return (int) $this->user()->company_id;
    }

    protected function existsInCompany(string $table): Exists
    {
        return Rule::exists($table, 'id')->where('company_id', $this->companyId());
    }

    /**
     * An active HRMS user of the same company.
     */
    protected function staffMember(): Exists
    {
        return Rule::exists('hrms.users', 'id')
            ->where('company_id', $this->companyId())
            ->where('is_active', true)
            ->whereNull('deleted_at');
    }
}
