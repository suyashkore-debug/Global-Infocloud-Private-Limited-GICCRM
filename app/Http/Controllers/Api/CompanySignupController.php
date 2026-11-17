<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * The public "new company" form (/newcompany): creates a CRM-only company and its first admin,
 * who then logs in and adds the company's staff in Setup → Staff Members. Nothing goes to HRMS.
 */
class CompanySignupController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $unique = fn (string $table, string $column) => Rule::unique($table, $column)->whereNull('deleted_at');
        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:150'],
            // The company's short code: its customers-area link (/portal/login?company=…).
            'short_code' => ['nullable', 'string', 'min:2', 'max:30', 'alpha_dash', $unique('crm_companies', 'short_code'), $unique('crm_companies', 'public_careers_slug')],
            'company_email' => ['nullable', 'email', 'max:150'],
            'company_phone' => ['nullable', 'string', 'max:20', 'regex:/^[\d+ \-]*$/'],
            // Indian GSTIN (15 characters) and PAN (10 characters).
            'gstin' => ['nullable', 'string', 'regex:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i'],
            'pan' => ['nullable', 'string', 'regex:/^[A-Z]{5}[0-9]{4}[A-Z]$/i'],
            'logo' => ['nullable', ...CompanyLogoController::RULES],
            'first_name' => ['required', 'string', 'max:50'],
            'last_name' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:150', $unique('crm_users', 'email')],
            'username' => ['nullable', 'string', 'min:3', 'max:100', 'regex:/^[A-Za-z0-9._@-]+$/', $unique('crm_users', 'username')],
            'mobile' => ['nullable', 'string', 'max:20', 'regex:/^[\d+ \-]*$/'],
            'password' => ['required', 'string', 'min:8', 'max:100', 'confirmed'],
        ], [
            'email.unique' => 'This e-mail already has an account. Log in instead.',
            'short_code.unique' => 'This short code is taken. Try another one.',
            'gstin.regex' => 'Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5.',
            'pan.regex' => 'Enter a valid 10-character PAN, e.g. ABCDE1234F.',
            'logo.mimes' => 'The logo must be a PNG or JPG image.',
        ]);

        $user = DB::transaction(function () use ($data, $request) {
            $company = new Company;
            $company->forceFill([
                'source' => 'crm',
                'company_name' => trim($data['company_name']),
                'short_code' => ($data['short_code'] ?? null) ? strtolower($data['short_code']) : null,
                'status' => 'active',
            ])->save();

            $user = new User;
            $user->forceFill([
                'source' => User::SOURCE_CRM,
                'company_id' => $company->id,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'] ?? null,
                'full_name' => trim($data['first_name'].' '.($data['last_name'] ?? '')),
                'email' => strtolower($data['email']),
                'username' => ($data['username'] ?? null) ? strtolower($data['username']) : null,
                'mobile' => $data['mobile'] ?? null,
                'password' => Hash::make($data['password']),
                'is_company_admin' => true,
                'is_active' => true,
            ])->save();
            $user->forceFill(['created_by' => $user->id])->save();

            Options::set('company_name', $company->company_name, $company->id);
            Options::set('company_email', strtolower((string) ($data['company_email'] ?? $data['email'])), $company->id);
            Options::set('company_phone', (string) ($data['company_phone'] ?? ''), $company->id);
            Options::set('company_vat', strtoupper((string) ($data['gstin'] ?? '')), $company->id);
            Options::set('company_pan', strtoupper((string) ($data['pan'] ?? '')), $company->id);
            if ($request->hasFile('logo')) {
                CompanyLogoController::save($company, $request->file('logo'));
            }

            return $user;
        });

        return response()->json([
            'message' => 'Your company account is ready. Log in to add your team.',
            'data' => ['username' => $user->username ?? $user->email],
        ], 201);
    }
}
