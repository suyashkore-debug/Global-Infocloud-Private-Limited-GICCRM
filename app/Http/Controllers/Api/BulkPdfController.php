<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CreditNote;
use App\Models\Estimate;
use App\Models\Invoice;
use App\Models\Proposal;
use App\Services\SalesPdf;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use ZipArchive;

/**
 * Utilities → Bulk PDF Export: every invoice / estimate / proposal / credit note in a date range
 * (optionally of one status) as a zip of PDFs.
 */
class BulkPdfController extends Controller
{
    private const TYPES = [
        'invoices' => [Invoice::class, 'invoice', 'invoices'],
        'estimates' => [Estimate::class, 'estimate', 'estimates'],
        'proposals' => [Proposal::class, 'proposal', 'proposals'],
        'credit_notes' => [CreditNote::class, 'creditNote', 'credit_notes'],
    ];

    public function __invoke(Request $request): BinaryFileResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::TYPES))],
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'status' => ['nullable', 'integer'],
        ]);
        [$model, $renderer, $feature] = self::TYPES[$data['type']];
        $user = $request->user();
        abort_unless($user->hasPermission($feature, 'view') || $user->hasPermission($feature, 'view_own'), 403);

        $documents = $model::query()
            ->when(method_exists($model, 'scopeVisibleTo'), fn ($q) => $q->visibleTo($user))
            ->whereBetween('date', [$data['from'], $data['to']])
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderBy('date')
            ->limit(500)
            ->get();
        abort_if($documents->isEmpty(), 404, 'Nothing to export for these filters.');

        $path = storage_path('app/private/'.uniqid('bulk-pdf-', true).'.zip');
        @mkdir(dirname($path), 0775, true);
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach ($documents as $document) {
            $response = SalesPdf::{$renderer}($document, false);
            $name = str_replace(['/', '\\'], '-', $document->formattedNumber()).'.pdf';
            $zip->addFromString($name, $response->getContent());
        }
        $zip->close();

        return response()->download($path, "{$data['type']}-{$data['from']}-{$data['to']}.zip")->deleteFileAfterSend();
    }
}
