<?php

namespace App\Observers;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Writes Perfex-style activity log lines ("New Invoice Created [ID: 5]") for the main records.
 */
class ActivityLogObserver
{
    public function created(Model $model): void
    {
        $this->log($model, 'New %s Created [ID: %d%s]');
    }

    public function deleted(Model $model): void
    {
        $this->log($model, '%s Deleted [ID: %d%s]');
    }

    private function log(Model $model, string $format): void
    {
        $user = Auth::user();
        $companyId = $model->getAttribute('company_id') ?? $user?->company_id;
        if (! $companyId) {
            return;
        }

        $label = Str::headline(class_basename($model));
        $name = $model->getAttribute('name') ?? $model->getAttribute('subject');
        $suffix = $name ? ', '.Str::limit((string) $name, 80) : '';
        if (method_exists($model, 'formattedNumber') && $model->getAttribute('number') !== null) {
            $suffix = ', '.$model->formattedNumber();
        }

        ActivityLog::create([
            'company_id' => $companyId,
            'user_id' => $user?->id,
            'description' => sprintf($format, $label, $model->getKey(), $suffix),
        ]);
    }
}
