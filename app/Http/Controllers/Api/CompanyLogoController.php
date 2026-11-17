<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Setup → Company Information → Company Logo (admins): shown in the app, on e-mails and PDFs.
 */
class CompanyLogoController extends Controller
{
    /** PNG or JPG only: PDFs cannot show WebP or SVG. */
    public const RULES = ['image', 'mimes:png,jpg,jpeg', 'max:2048'];

    public function store(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $request->validate(['logo' => ['required', ...self::RULES]]);
        self::save($company, $request->file('logo'));

        return response()->json(['message' => 'Logo updated.', 'data' => ['logo_url' => $company->logoUrl()]]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $company->crm_logo && Storage::disk('public')->delete($company->crm_logo);
        $company->forceFill(['crm_logo' => null])->save();

        return response()->json(['message' => 'Logo removed.', 'data' => ['logo_url' => $company->logoUrl()]]);
    }

    /** Store a new logo for the company, replacing the old file. */
    public static function save(Company $company, UploadedFile $file): void
    {
        $old = $company->crm_logo;
        $company->forceFill(['crm_logo' => $file->store("company-logos/{$company->id}", 'public')])->save();
        $old && Storage::disk('public')->delete($old);
    }

    private function company(Request $request): Company
    {
        abort_unless($request->user()->isAdmin(), 403);

        return Company::findOrFail($request->user()->company_id);
    }
}
