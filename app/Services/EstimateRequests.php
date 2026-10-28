<?php

namespace App\Services;

use App\Models\Estimate;
use App\Models\EstimateRequest;
use App\Models\Proposal;

class EstimateRequests
{
    /**
     * Perfex: saving the estimate / proposal a request was converted to marks the request
     * "Completed" and remembers the document.
     */
    public static function completeWith(?int $requestId, Estimate|Proposal $document): void
    {
        if (! $requestId || ! ($request = EstimateRequest::find($requestId))) {
            return;
        }

        $request->update([
            'estimate_request_status_id' => DefaultLookups::estimateRequestStatus('completed')->id,
            'last_status_change_at' => now(),
            'date_estimated' => now(),
            $document instanceof Estimate ? 'estimate_id' : 'proposal_id' => $document->id,
        ]);
    }
}
