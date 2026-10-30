<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\LeadImport;
use App\Services\LeadImportException;
use App\Services\Notifier;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Leads → Import Leads (Perfex): the columns and guidelines, the sample CSV, and the import or its
 * simulation. Admins, and other staff when Setup → Leads allows it.
 */
class LeadImportController extends Controller
{
    public function __construct(private Notifier $notifier) {}

    public function show(Request $request): JsonResponse
    {
        $this->allowed($request);
        $import = new LeadImport($request->user(), $this->notifier);

        return response()->json(['data' => [
            'headings' => $import->headings(),
            'unique_fields' => array_values(array_filter(explode(',', Options::get('lead_unique_validation')))),
            'default_status_id' => Options::get('leads_default_status'),
            'default_source_id' => Options::get('leads_default_source'),
            'max_rows' => LeadImport::MAX_ROWS,
            'preview_rows' => LeadImport::PREVIEW_ROWS,
        ]]);
    }

    public function sample(Request $request): Response
    {
        $this->allowed($request);

        return response((new LeadImport($request->user(), $this->notifier))->sampleCsv(), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="sample_leads_import.csv"',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->allowed($request);
        $company = $request->user()->company_id;
        $data = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:csv,txt'],
            'status_id' => ['required', 'integer', Rule::exists('lead_statuses', 'id')->where('company_id', $company)],
            'source_id' => ['required', 'integer', Rule::exists('lead_sources', 'id')->where('company_id', $company)],
            'assigned_id' => ['nullable', 'integer', Rule::exists('hrms.users', 'id')->where('company_id', $company)->where('is_active', true)],
            'simulate' => ['boolean'],
        ], [
            'file.mimes' => 'Choose a .csv file.',
        ]);

        try {
            $result = (new LeadImport($request->user(), $this->notifier))->run($data['file']->getRealPath(), [
                'status_id' => (int) $data['status_id'],
                'source_id' => (int) $data['source_id'],
                'assigned_id' => isset($data['assigned_id']) ? (int) $data['assigned_id'] : null,
                'simulate' => (bool) ($data['simulate'] ?? false),
            ]);
        } catch (LeadImportException $e) {
            return response()->json(['message' => $e->getMessage(), 'errors' => ['file' => [$e->getMessage()]]], 422);
        }

        return response()->json(['data' => $result]);
    }

    private function allowed(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->isAdmin() || Options::get('allow_non_admin_members_to_import_leads') === '1', 403, 'Only admins can import leads.');
    }
}
