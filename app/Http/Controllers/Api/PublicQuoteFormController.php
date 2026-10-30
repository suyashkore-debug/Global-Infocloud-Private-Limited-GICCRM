<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EstimateRequest;
use App\Models\EstimateRequestForm;
use App\Models\EstimateRequestStatus;
use App\Services\DefaultLookups;
use App\Services\Notifier;
use App\Services\Recaptcha;
use App\Support\PublicFormFields;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The public estimate request web form (Perfex forms/quote/{key}): no login, found by its key.
 */
class PublicQuoteFormController extends Controller
{
    public function show(string $key): JsonResponse
    {
        $form = $this->form($key);

        return response()->json(['data' => [
            'name' => $form->name,
            'fields' => $form->fields,
            'submit_btn_name' => $form->submit_btn_name,
            'recaptcha_site_key' => Recaptcha::forForm($form->recaptcha, $form->company_id),
        ]]);
    }

    public function submit(Request $request, string $key, Notifier $notifier): JsonResponse
    {
        $form = $this->form($key);
        if (Recaptcha::forForm($form->recaptcha, $form->company_id)) {
            Recaptcha::check($request->input('g-recaptcha-response'), $request->ip(), $form->company_id);
        }
        $data = $request->validate(PublicFormFields::rules($form->fields));

        $submission = collect($form->fields)->reject(fn ($f) => $f['type'] === 'file')->map(fn ($f) => [
            'label' => $f['label'],
            'name' => $f['name'],
            'value' => $data[$f['name']] ?? null,
        ])->values()->all();

        DefaultLookups::ensureEstimateRequestStatuses($form->company_id);
        $estimateRequest = DB::transaction(function () use ($form, $data, $submission, $request) {
            $estimateRequest = EstimateRequest::create([
                'company_id' => $form->company_id,
                'email' => $data['email'],
                'submission' => $submission,
                'estimate_request_form_id' => $form->id,
                'estimate_request_status_id' => $form->estimate_request_status_id
                    ?? EstimateRequestStatus::where('company_id', $form->company_id)->where('flag', 'processing')->value('id'),
                'assigned_id' => $form->responsible_id,
            ]);

            foreach ($form->fields as $field) {
                if ($field['type'] !== 'file') {
                    continue;
                }
                foreach ($request->file($field['name'], []) as $file) {
                    $estimateRequest->attachments()->create([
                        'company_id' => $form->company_id,
                        'user_id' => 0,
                        'disk_path' => $file->store("attachments/{$form->company_id}/estimate_requests/{$estimateRequest->id}", 'local'),
                        'original_name' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(),
                        'size' => $file->getSize(),
                    ]);
                }
            }

            return $estimateRequest;
        });

        $link = "/estimate-requests/{$estimateRequest->id}";
        $notifier->notify(array_diff($form->notifyUserIds(), [(int) $form->responsible_id]), "New estimate request submitted from {$form->name}", $link, $form->company_id);
        if ($form->responsible_id) {
            $notifier->notify([$form->responsible_id], "Estimate request #{$estimateRequest->id} has been assigned to you", $link, $form->company_id);
        }

        return response()->json(['message' => $form->success_submit_msg ?: 'Thank you! Your request has been received. We will get back to you soon.'], 201);
    }

    private function form(string $key): EstimateRequestForm
    {
        return EstimateRequestForm::where('form_key', $key)->where('active', true)->firstOrFail();
    }
}
