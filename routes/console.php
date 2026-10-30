<?php

use App\Services\ContractService;
use App\Services\EstimateService;
use App\Services\ExpenseService;
use App\Services\GoalService;
use App\Services\InvoiceService;
use Illuminate\Support\Facades\Schedule;

Schedule::command('tasks:send-reminders')->everyMinute()->withoutOverlapping();
Schedule::command('emails:send-scheduled')->everyMinute()->withoutOverlapping();
Schedule::command('backup:run --auto')->hourly()->withoutOverlapping();
Schedule::command('timers:auto-stop')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('tasks:create-recurring')->dailyAt('00:10')->withoutOverlapping();

Schedule::call(fn () => app(InvoiceService::class)->markOverdue())->name('invoices:overdue')->dailyAt('00:05')->withoutOverlapping();
Schedule::call(fn () => app(InvoiceService::class)->createRecurring())->name('invoices:recurring')->dailyAt('00:15')->withoutOverlapping();
Schedule::call(fn () => app(EstimateService::class)->markExpired())->name('estimates:expire')->dailyAt('00:20')->withoutOverlapping();
Schedule::call(fn () => app(ContractService::class)->notifyExpiring())->name('contracts:expiry')->dailyAt('08:00')->withoutOverlapping();
Schedule::call(fn () => app(ExpenseService::class)->createRecurring())->name('expenses:recurring')->dailyAt('00:25')->withoutOverlapping();
Schedule::call(fn () => app(GoalService::class)->notifyFinished())->name('goals:notify')->dailyAt('08:05')->withoutOverlapping();
