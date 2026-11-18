<?php

namespace App\Providers;

use App\Models\AppliedCredit;
use App\Models\ChecklistTemplate;
use App\Models\Contact;
use App\Models\Contract;
use App\Models\ContractComment;
use App\Models\CreditNote;
use App\Models\CreditNoteRefund;
use App\Models\Customer;
use App\Models\Discussion;
use App\Models\DiscussionComment;
use App\Models\Estimate;
use App\Models\Expense;
use App\Models\Goal;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\KbArticle;
use App\Models\Lead;
use App\Models\Milestone;
use App\Models\NewsfeedComment;
use App\Models\Payment;
use App\Models\PersonalAccessToken;
use App\Models\Project;
use App\Models\Proposal;
use App\Models\Task;
use App\Models\TaskChecklistItem;
use App\Models\TaskComment;
use App\Models\TaskReminder;
use App\Models\TaskTimer;
use App\Models\Ticket;
use App\Observers\ActivityLogObserver;
use App\Services\CustomFields;
use App\Services\Options;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login tokens are issued by HRMS and stored in the HRMS database.
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        $this->bindThroughParent();

        // A record opened from another workspace: the app switches to that workspace (header X-Record-Workspace).
        Event::listen(RequestHandled::class, function (RequestHandled $event) {
            if ($id = $event->request->attributes->get('record_workspace')) {
                $event->response->headers->set('X-Record-Workspace', (string) $id);
            }
            // A public page or webhook pinned its record's workspace for this request only.
            Options::releaseWorkspace();
        });

        // A queued job uses the settings of the workspace it was dispatched in (its e-mail account,
        // WhatsApp number, templates…), then the worker goes back to none.
        Queue::createPayloadUsing(fn () => ['options_workspace' => Options::forJob()]);
        $states = [];
        Event::listen(JobProcessing::class, function (JobProcessing $event) use (&$states) {
            $states[] = Options::state();
            Options::useWorkspace($event->job->payload()['options_workspace'] ?? null);
        });
        $back = function () use (&$states) {
            Options::restore(array_pop($states) ?? [null, false]);
        };
        Event::listen(JobProcessed::class, $back);
        Event::listen(JobExceptionOccurred::class, $back);

        // A deleted record takes its custom field values with it.
        foreach (CustomFields::RECORD_TYPES as $fieldTo => $model) {
            $model::deleted(fn ($record) => CustomFields::forget($fieldTo, (int) $record->getKey()));
        }

        foreach ([
            Customer::class, Project::class, Task::class, Invoice::class,
            Estimate::class, Proposal::class, CreditNote::class, Payment::class,
            Expense::class, Contract::class, Lead::class, Ticket::class,
            Item::class, KbArticle::class, Goal::class,
        ] as $model) {
            $model::observe(ActivityLogObserver::class);
        }
    }

    /**
     * Child rows have no company_id of their own: resolve them only through a parent the signed-in
     * user's company owns (the parents' company scope applies inside whereHas), so an id from
     * another company is a 404.
     */
    private function bindThroughParent(): void
    {
        $bindings = [
            'checklistItem' => [TaskChecklistItem::class, 'task'],
            'taskComment' => [TaskComment::class, 'task'],
            'taskReminder' => [TaskReminder::class, 'task'],
            'milestone' => [Milestone::class, 'project'],
            'discussion' => [Discussion::class, 'project'],
            'discussionComment' => [DiscussionComment::class, 'discussion.project'],
            'contact' => [Contact::class, 'customer'],
            'appliedCredit' => [AppliedCredit::class, 'creditNote'],
            'refund' => [CreditNoteRefund::class, 'creditNote'],
            'contractComment' => [ContractComment::class, 'contract'],
            'newsfeedComment' => [NewsfeedComment::class, 'post'],
        ];

        foreach ($bindings as $parameter => [$model, $parent]) {
            Route::bind($parameter, fn (string $value) => $model::query()->whereKey($value)->whereHas($parent)->firstOrFail());
        }

        // A timer started from the header has no task yet: only its owner can reach it.
        Route::bind('timer', fn (string $value) => TaskTimer::query()->whereKey($value)
            ->where(fn ($q) => $q->whereHas('task')->orWhere(fn ($q) => $q->whereNull('task_id')->where('user_id', auth()->id())))
            ->firstOrFail());
        Route::bind('checklistTemplate', fn (string $value) => ChecklistTemplate::query()->findOrFail($value));
    }
}
