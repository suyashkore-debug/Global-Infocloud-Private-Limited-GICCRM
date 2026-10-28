<?php

use App\Http\Controllers\Api\AccountingController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\BulkPdfController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\CreditNoteController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomFieldController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DiscussionController;
use App\Http\Controllers\Api\DocumentEmailController;
use App\Http\Controllers\Api\EmailSettingsController;
use App\Http\Controllers\Api\EstimateController;
use App\Http\Controllers\Api\EstimateRequestController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\GoalController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\KnowledgeBaseController;
use App\Http\Controllers\Api\LeadCallController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\MailListController;
use App\Http\Controllers\Api\ManagementDashboardController;
use App\Http\Controllers\Api\MilestoneController;
use App\Http\Controllers\Api\MyTimesheetController;
use App\Http\Controllers\Api\NewsfeedController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProposalController;
use App\Http\Controllers\Api\PublicDocumentController;
use App\Http\Controllers\Api\PublicQuoteFormController;
use App\Http\Controllers\Api\PublicSurveyController;
use App\Http\Controllers\Api\Purchase\PurchaseInvoiceController;
use App\Http\Controllers\Api\Purchase\PurchaseOrderController;
use App\Http\Controllers\Api\Purchase\PurchaseRequestController;
use App\Http\Controllers\Api\Purchase\PurchaseSettingsController;
use App\Http\Controllers\Api\Purchase\VendorController;
use App\Http\Controllers\Api\PushController;
use App\Http\Controllers\Api\RealtimeAuthController;
use App\Http\Controllers\Api\RecordExtrasController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SavedFilterController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\SetupController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\SurveyController;
use App\Http\Controllers\Api\TagController;
use App\Http\Controllers\Api\TaskChecklistController;
use App\Http\Controllers\Api\TaskCommentController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskPeopleController;
use App\Http\Controllers\Api\TaskReminderController;
use App\Http\Controllers\Api\TelephonyController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\TimerController;
use App\Http\Controllers\Api\TodoController;
use App\Http\Controllers\Api\UtilitiesController;
use App\Http\Controllers\Api\WhatsAppController;
use App\Http\Controllers\Portal\PortalAuthController;
use App\Http\Controllers\Portal\PortalChatController;
use App\Http\Controllers\Portal\PortalController;
use App\Http\Middleware\AuthenticateContact;
use App\Http\Middleware\EnsureUserCanUseApp;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:10,1')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->name('login');
    Route::post('/login/verify-otp', [AuthController::class, 'verifyLoginOtp'])->name('login.verify-otp');
});

// WhatsApp webhook (Meta): replies from leads and delivery receipts, per company.
Route::middleware('throttle:600,1')->group(function () {
    Route::get('/whatsapp/webhook/{company}', [WhatsAppController::class, 'verify'])->whereNumber('company');
    Route::post('/whatsapp/webhook/{company}', [WhatsAppController::class, 'webhook'])->whereNumber('company');
    Route::post('/whatsapp/bird/{company}', [WhatsAppController::class, 'birdWebhook'])->whereNumber('company');
});

// Exotel webhooks: the result of each click-to-call, and incoming calls (Passthru applet).
Route::middleware('throttle:600,1')->group(function () {
    Route::post('/calls/exotel/{company}/{token}/status', [TelephonyController::class, 'status'])->whereNumber('company');
    Route::match(['get', 'post'], '/calls/exotel/{company}/{token}/incoming', [TelephonyController::class, 'incoming'])->whereNumber('company');
});

// Forgot password (HRMS's reset, relayed): a few tries per minute.
Route::post('/forgot-password/send-otp', [PasswordResetController::class, 'sendOtp'])->middleware('throttle:3,1');
Route::post('/forgot-password/verify-otp', [PasswordResetController::class, 'verifyOtp'])->middleware('throttle:10,1');
Route::post('/forgot-password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:5,1');

// Customers area (Perfex client portal): contacts log in with their own password.
Route::prefix('portal')->group(function () {
    Route::get('/branding', [PortalAuthController::class, 'branding'])->middleware('throttle:60,1');
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/login', [PortalAuthController::class, 'login']);
        Route::post('/forgot-password', [PortalAuthController::class, 'forgot']);
        Route::post('/reset-password', [PortalAuthController::class, 'reset']);
    });

    Route::middleware(AuthenticateContact::class)->group(function () {
        Route::get('/me', [PortalAuthController::class, 'me']);
        Route::post('/logout', [PortalAuthController::class, 'logout']);
        Route::get('/dashboard', [PortalController::class, 'dashboard']);
        Route::get('/chat', [PortalChatController::class, 'index']);
        Route::post('/chat', [PortalChatController::class, 'send']);
        Route::post('/chat/typing', [PortalChatController::class, 'typing'])->middleware('throttle:120,1');
        Route::get('/chat/unread', [PortalChatController::class, 'unread']);
        Route::post('/realtime/auth', [RealtimeAuthController::class, 'contact'])->middleware('throttle:60,1');
        Route::get('/chat/files/{attachmentId}', [PortalChatController::class, 'file'])->whereNumber('attachmentId');
        Route::get('/documents/{type}', [PortalController::class, 'documents'])->whereIn('type', ['invoices', 'estimates', 'proposals', 'contracts']);
        Route::get('/statement', [PortalController::class, 'statement']);
        Route::get('/tickets/options', [PortalController::class, 'ticketOptions']);
        Route::get('/tickets', [PortalController::class, 'ticketIndex']);
        Route::post('/tickets', [PortalController::class, 'ticketStore']);
        Route::get('/tickets/{id}', [PortalController::class, 'ticketShow'])->whereNumber('id');
        Route::post('/tickets/{id}/reply', [PortalController::class, 'ticketReply'])->whereNumber('id');
        Route::post('/tickets/{id}/close', [PortalController::class, 'ticketClose'])->whereNumber('id');
        Route::get('/projects', [PortalController::class, 'projectIndex']);
        Route::get('/projects/{id}', [PortalController::class, 'projectShow'])->whereNumber('id');
        Route::get('/projects/{project}/tasks/{task}', [PortalController::class, 'taskShow'])->whereNumber(['project', 'task']);
        Route::post('/projects/{project}/tasks/{task}/comments', [PortalController::class, 'taskComment'])->whereNumber(['project', 'task']);
        Route::get('/knowledge-base', [PortalController::class, 'knowledgeBase']);
        Route::get('/knowledge-base/{id}', [PortalController::class, 'article'])->whereNumber('id');
        Route::put('/profile', [PortalController::class, 'updateProfile']);
        Route::post('/profile/password', [PortalController::class, 'changePassword']);
        Route::get('/company', [PortalController::class, 'company']);
        Route::put('/company', [PortalController::class, 'updateCompany']);
    });
});

// Taking part in a survey (login only when the survey asks for it).
Route::get('/public/surveys/{id}/{hash}', [PublicSurveyController::class, 'show'])->whereNumber('id');
Route::post('/public/surveys/{id}/{hash}', [PublicSurveyController::class, 'submit'])->whereNumber('id')->middleware('throttle:20,1');

// A customer's view of a document from an e-mail link (no login, protected by the hash).
Route::get('/public/documents/{type}/{id}/{hash}', [PublicDocumentController::class, 'show'])->whereNumber('id');
Route::get('/public/documents/{type}/{id}/{hash}/pdf', [PublicDocumentController::class, 'pdf'])->whereNumber('id');
Route::post('/public/documents/{type}/{id}/{hash}/respond', [PublicDocumentController::class, 'respond'])->whereNumber('id')->middleware('throttle:10,1');

// Public estimate request web form (no login).
Route::get('/public/quote-forms/{key}', [PublicQuoteFormController::class, 'show']);
Route::post('/public/quote-forms/{key}', [PublicQuoteFormController::class, 'submit'])->middleware('throttle:10,1');

Route::middleware(['auth:sanctum', EnsureUserCanUseApp::class])->group(function () {
    Route::get('/me', [AuthController::class, 'me'])->name('me');
    Route::get('/companies', [AuthController::class, 'companies']);
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    Route::get('/dashboard', DashboardController::class);
    Route::get('/dashboard/insights', [DashboardController::class, 'insights']);
    Route::get('/search', SearchController::class);
    Route::post('/realtime/auth', [RealtimeAuthController::class, 'staff'])->middleware('throttle:60,1');
    Route::get('/push/key', [PushController::class, 'key']);
    Route::post('/push/subscribe', [PushController::class, 'subscribe'])->middleware('throttle:30,1');
    Route::post('/push/unsubscribe', [PushController::class, 'unsubscribe']);
    Route::get('/staff', [StaffController::class, 'index']);

    // Customers
    Route::get('/customers/options', [CustomerController::class, 'options']);
    Route::apiResource('customers', CustomerController::class);
    Route::post('/customers/{customer}/contacts', [ContactController::class, 'store']);
    Route::put('/contacts/{contact}', [ContactController::class, 'update']);
    Route::post('/contacts/{contact}/send-password-email', [ContactController::class, 'sendPasswordEmail']);
    Route::delete('/contacts/{contact}', [ContactController::class, 'destroy']);

    // Sales
    Route::apiResource('items', ItemController::class)->except('show');
    Route::get('/invoices/defaults', [InvoiceController::class, 'defaults']);
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('/invoices/{invoice}/action', [InvoiceController::class, 'action']);
    Route::post('/invoices/{invoice}/copy', [InvoiceController::class, 'copy']);
    Route::get('/invoices/{invoice}/pdf', [InvoiceController::class, 'pdf']);
    Route::post('/invoices/{invoice}/payments', [PaymentController::class, 'store']);
    Route::get('/estimates/defaults', [EstimateController::class, 'defaults']);
    Route::post('/estimates/move', [EstimateController::class, 'move']);
    Route::apiResource('estimates', EstimateController::class);
    Route::post('/estimates/{estimate}/action', [EstimateController::class, 'action']);
    Route::post('/estimates/{estimate}/convert', [EstimateController::class, 'convertToInvoice']);
    Route::post('/estimates/{estimate}/copy', [EstimateController::class, 'copy']);
    Route::get('/estimates/{estimate}/pdf', [EstimateController::class, 'pdf']);

    Route::get('/proposals/defaults', [ProposalController::class, 'defaults']);
    Route::apiResource('proposals', ProposalController::class);
    Route::post('/proposals/{proposal}/status', [ProposalController::class, 'status']);
    Route::post('/proposals/{proposal}/convert', [ProposalController::class, 'convert']);
    Route::post('/proposals/{proposal}/copy', [ProposalController::class, 'copy']);
    Route::get('/proposals/{proposal}/pdf', [ProposalController::class, 'pdf']);

    Route::get('/credit-notes/defaults', [CreditNoteController::class, 'defaults']);
    Route::apiResource('credit-notes', CreditNoteController::class)->parameters(['credit-notes' => 'creditNote']);
    Route::get('/credit-notes/{creditNote}/creditable-invoices', [CreditNoteController::class, 'creditableInvoices']);
    Route::post('/credit-notes/{creditNote}/apply', [CreditNoteController::class, 'apply']);
    Route::post('/credit-notes/{creditNote}/refunds', [CreditNoteController::class, 'refund']);
    Route::post('/credit-notes/{creditNote}/action', [CreditNoteController::class, 'action']);
    Route::get('/credit-notes/{creditNote}/pdf', [CreditNoteController::class, 'pdf']);
    Route::delete('/applied-credits/{appliedCredit}', [CreditNoteController::class, 'deleteAppliedCredit']);
    Route::delete('/credit-note-refunds/{refund}', [CreditNoteController::class, 'deleteRefund']);

    // Expenses
    Route::apiResource('expenses', ExpenseController::class);
    Route::post('/expenses/{expense}/convert', [ExpenseController::class, 'convertToInvoice']);
    Route::post('/expenses/{expense}/copy', [ExpenseController::class, 'copy']);

    // Contracts
    Route::apiResource('contracts', ContractController::class);
    Route::post('/contracts/{contract}/renew', [ContractController::class, 'renew']);
    Route::post('/contracts/{contract}/action', [ContractController::class, 'action']);
    Route::post('/contracts/{contract}/copy', [ContractController::class, 'copy']);
    Route::post('/contracts/{contract}/comments', [ContractController::class, 'addComment']);
    Route::delete('/contract-comments/{contractComment}', [ContractController::class, 'deleteComment']);

    // Leads
    Route::post('/leads/move', [LeadController::class, 'move']);
    Route::apiResource('leads', LeadController::class);
    Route::post('/leads/{lead}/flag', [LeadController::class, 'flag']);
    Route::post('/leads/{lead}/convert', [LeadController::class, 'convert']);
    Route::get('/leads/{lead}/calls', [LeadCallController::class, 'index']);
    Route::post('/leads/{lead}/calls', [LeadCallController::class, 'store']);
    Route::put('/leads/{lead}/calls/{call}', [LeadCallController::class, 'update']);
    Route::post('/leads/{lead}/calls/dial', [LeadCallController::class, 'dial'])->middleware('throttle:30,1');
    Route::get('/leads/{lead}/calls/{call}/recording', [LeadCallController::class, 'recording']);
    Route::get('/leads/{lead}/whatsapp', [WhatsAppController::class, 'index']);
    Route::post('/leads/{lead}/whatsapp', [WhatsAppController::class, 'send'])->middleware('throttle:60,1');

    // Support
    Route::apiResource('tickets', TicketController::class);
    Route::post('/tickets/{ticket}/reply', [TicketController::class, 'reply']);
    Route::post('/tickets/{ticket}/status', [TicketController::class, 'changeStatus']);

    // Notes, reminders and files on leads / customers / contracts / tickets / expenses
    Route::get('/records/{type}/{id}/notes', [RecordExtrasController::class, 'notes'])->whereNumber('id');
    Route::post('/records/{type}/{id}/notes', [RecordExtrasController::class, 'addNote'])->whereNumber('id');
    Route::get('/records/{type}/{id}/reminders', [RecordExtrasController::class, 'reminders'])->whereNumber('id');
    Route::post('/records/{type}/{id}/reminders', [RecordExtrasController::class, 'addReminder'])->whereNumber('id');
    Route::post('/records/{type}/{id}/files', [RecordExtrasController::class, 'upload'])->whereNumber('id');
    Route::delete('/notes/{note}', [RecordExtrasController::class, 'deleteNote']);
    Route::delete('/reminders/{reminder}', [RecordExtrasController::class, 'deleteReminder']);

    // Knowledge base
    Route::get('/kb', [KnowledgeBaseController::class, 'index']);
    Route::get('/kb/articles/{article}', [KnowledgeBaseController::class, 'show']);
    Route::post('/kb/articles', [KnowledgeBaseController::class, 'storeArticle']);
    Route::put('/kb/articles/{article}', [KnowledgeBaseController::class, 'updateArticle']);
    Route::delete('/kb/articles/{article}', [KnowledgeBaseController::class, 'destroyArticle']);
    Route::post('/kb/articles/{article}/vote', [KnowledgeBaseController::class, 'vote']);
    Route::post('/kb/groups', [KnowledgeBaseController::class, 'storeGroup']);
    Route::put('/kb/groups/{group}', [KnowledgeBaseController::class, 'updateGroup']);
    Route::delete('/kb/groups/{group}', [KnowledgeBaseController::class, 'destroyGroup']);

    // Utilities
    Route::apiResource('announcements', AnnouncementController::class)->except('show');
    Route::post('/announcements/{announcement}/dismiss', [AnnouncementController::class, 'dismiss']);
    Route::get('/calendar', [CalendarController::class, 'index']);
    Route::post('/calendar/events', [CalendarController::class, 'store']);
    Route::put('/calendar/events/{event}', [CalendarController::class, 'update']);
    Route::delete('/calendar/events/{event}', [CalendarController::class, 'destroy']);
    Route::get('/activity-log', [UtilitiesController::class, 'activityLog']);
    Route::delete('/activity-log', [UtilitiesController::class, 'clearActivityLog']);
    Route::get('/media', [UtilitiesController::class, 'media']);
    Route::post('/media', [UtilitiesController::class, 'uploadMedia']);
    Route::get('/media/{media}/download', [UtilitiesController::class, 'downloadMedia']);
    Route::delete('/media/{media}', [UtilitiesController::class, 'deleteMedia']);
    Route::apiResource('goals', GoalController::class)->except('show');
    Route::post('/bulk-pdf', BulkPdfController::class);

    // Send a sales document / contract by e-mail
    Route::get('/{type}/{id}/email', [DocumentEmailController::class, 'preview'])->whereIn('type', ['invoices', 'estimates', 'proposals', 'credit-notes', 'contracts'])->whereNumber('id');
    Route::post('/{type}/{id}/email', [DocumentEmailController::class, 'send'])->whereIn('type', ['invoices', 'estimates', 'proposals', 'credit-notes', 'contracts'])->whereNumber('id');
    Route::get('/contracts/{contract}/pdf', [ContractController::class, 'pdf']);

    // E-mail settings, templates and log (admins)
    Route::get('/settings/email', [EmailSettingsController::class, 'show']);
    Route::put('/settings/email', [EmailSettingsController::class, 'update']);
    Route::post('/settings/email/test', [EmailSettingsController::class, 'test']);
    Route::get('/settings/whatsapp', [WhatsAppController::class, 'settings']);
    Route::put('/settings/whatsapp', [WhatsAppController::class, 'saveSettings']);
    Route::get('/settings/calls', [TelephonyController::class, 'settings']);
    Route::put('/settings/calls', [TelephonyController::class, 'saveSettings']);
    Route::get('/email-templates', [EmailSettingsController::class, 'templates']);
    Route::get('/email-templates/{emailTemplate}', [EmailSettingsController::class, 'template']);
    Route::put('/email-templates/{emailTemplate}', [EmailSettingsController::class, 'updateTemplate']);
    Route::post('/email-templates/type/{type}', [EmailSettingsController::class, 'toggleType']);
    Route::get('/email-logs', [EmailSettingsController::class, 'logs']);

    // Accounting
    Route::prefix('accounting')->group(function () {
        Route::get('/accounts', [AccountingController::class, 'accounts']);
        Route::post('/accounts', [AccountingController::class, 'storeAccount']);
        Route::put('/accounts/{account}', [AccountingController::class, 'updateAccount']);
        Route::delete('/accounts/{account}', [AccountingController::class, 'destroyAccount']);
        Route::get('/accounts/{account}/history', [AccountingController::class, 'history']);
        Route::post('/detail-types', [AccountingController::class, 'storeDetailType']);
        Route::get('/journal-entries', [AccountingController::class, 'journalEntries']);
        Route::post('/journal-entries', [AccountingController::class, 'saveJournalEntry']);
        Route::get('/journal-entries/{journalEntry}', [AccountingController::class, 'journalEntry']);
        Route::put('/journal-entries/{journalEntry}', [AccountingController::class, 'saveJournalEntry']);
        Route::delete('/journal-entries/{journalEntry}', [AccountingController::class, 'destroyJournalEntry']);
        Route::get('/transfers', [AccountingController::class, 'transfers']);
        Route::post('/transfers', [AccountingController::class, 'storeTransfer']);
        Route::delete('/transfers/{transfer}', [AccountingController::class, 'destroyTransfer']);
        Route::get('/reports/{report}', [AccountingController::class, 'report']);
    });

    // Purchase (vendors, requests, orders, invoices)
    Route::prefix('purchase')->group(function () {
        Route::get('/vendors/options', [VendorController::class, 'options']);
        Route::apiResource('vendors', VendorController::class);
        Route::post('/vendors/{vendor}/contacts', [VendorController::class, 'saveContact']);
        Route::put('/vendors/{vendor}/contacts/{vendorContact}', [VendorController::class, 'saveContact']);
        Route::delete('/vendors/{vendor}/contacts/{vendorContact}', [VendorController::class, 'deleteContact']);
        Route::apiResource('requests', PurchaseRequestController::class)->parameters(['requests' => 'purchaseRequest']);
        Route::post('/requests/{purchaseRequest}/action', [PurchaseRequestController::class, 'action']);
        Route::apiResource('orders', PurchaseOrderController::class)->parameters(['orders' => 'purchaseOrder']);
        Route::post('/orders/{purchaseOrder}/action', [PurchaseOrderController::class, 'action']);
        Route::get('/orders/{purchaseOrder}/pdf', [PurchaseOrderController::class, 'pdf']);
        Route::apiResource('invoices', PurchaseInvoiceController::class)->parameters(['invoices' => 'purchaseInvoice']);
        Route::post('/invoices/{purchaseInvoice}/payments', [PurchaseInvoiceController::class, 'addPayment']);
        Route::delete('/invoices/{purchaseInvoice}/payments/{payment}', [PurchaseInvoiceController::class, 'deletePayment']);
        Route::post('/invoices/{purchaseInvoice}/files', [PurchaseInvoiceController::class, 'upload']);
        Route::get('/invoices/{purchaseInvoice}/pdf', [PurchaseInvoiceController::class, 'pdf']);
        Route::get('/approval-settings', [PurchaseSettingsController::class, 'approvals']);
        Route::post('/approval-settings', [PurchaseSettingsController::class, 'saveApproval']);
        Route::put('/approval-settings/{setting}', [PurchaseSettingsController::class, 'saveApproval']);
        Route::delete('/approval-settings/{setting}', [PurchaseSettingsController::class, 'deleteApproval']);
    });

    // Surveys and mail lists
    Route::get('/surveys', [SurveyController::class, 'index']);
    Route::post('/surveys', [SurveyController::class, 'store']);
    Route::get('/surveys/{survey}', [SurveyController::class, 'show']);
    Route::put('/surveys/{survey}', [SurveyController::class, 'update']);
    Route::delete('/surveys/{survey}', [SurveyController::class, 'destroy']);
    Route::get('/surveys/{survey}/results', [SurveyController::class, 'results']);
    Route::post('/surveys/{survey}/send', [SurveyController::class, 'send']);
    Route::delete('/surveys/{survey}/send-logs/{log}', [SurveyController::class, 'deleteSendLog'])->whereNumber('log');
    Route::get('/mail-lists', [MailListController::class, 'index']);
    Route::post('/mail-lists', [MailListController::class, 'store']);
    Route::get('/mail-lists/{mailList}', [MailListController::class, 'show']);
    Route::put('/mail-lists/{mailList}', [MailListController::class, 'update']);
    Route::delete('/mail-lists/{mailList}', [MailListController::class, 'destroy']);
    Route::post('/mail-lists/{mailList}/emails', [MailListController::class, 'addEmails']);
    Route::delete('/mail-lists/{mailList}/emails/{email}', [MailListController::class, 'removeEmail'])->whereNumber('email');

    // Custom fields
    Route::get('/custom-fields', [CustomFieldController::class, 'index']);
    Route::post('/custom-fields', [CustomFieldController::class, 'store']);
    Route::put('/custom-fields/{customField}', [CustomFieldController::class, 'update']);
    Route::delete('/custom-fields/{customField}', [CustomFieldController::class, 'destroy']);
    Route::get('/custom-fields/for/{fieldTo}', [CustomFieldController::class, 'definitions']);
    Route::get('/custom-field-values/{fieldTo}', [CustomFieldController::class, 'values']);
    Route::put('/custom-field-values/{fieldTo}/{id}', [CustomFieldController::class, 'save'])->whereNumber('id');

    // Newsfeed
    Route::get('/newsfeed', [NewsfeedController::class, 'index']);
    Route::post('/newsfeed', [NewsfeedController::class, 'store']);
    Route::delete('/newsfeed/{post}', [NewsfeedController::class, 'destroy']);
    Route::post('/newsfeed/{post}/pin', [NewsfeedController::class, 'pin']);
    Route::match(['post', 'delete'], '/newsfeed/{post}/like', [NewsfeedController::class, 'like']);
    Route::get('/newsfeed/{post}/likes', [NewsfeedController::class, 'likes']);
    Route::post('/newsfeed/{post}/comments', [NewsfeedController::class, 'comment']);
    Route::delete('/newsfeed-comments/{newsfeedComment}', [NewsfeedController::class, 'deleteComment']);
    Route::match(['post', 'delete'], '/newsfeed-comments/{newsfeedComment}/like', [NewsfeedController::class, 'likeComment']);

    // To do items
    Route::get('/todos', [TodoController::class, 'index']);
    Route::get('/todos/count', [TodoController::class, 'count']);
    Route::post('/todos', [TodoController::class, 'store']);
    Route::post('/todos/reorder', [TodoController::class, 'reorder']);
    Route::patch('/todos/{id}', [TodoController::class, 'update'])->whereNumber('id');
    Route::delete('/todos/{id}', [TodoController::class, 'destroy'])->whereNumber('id');

    // My profile / my timesheets
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::post('/profile/photo', [ProfileController::class, 'changePhoto']);
    Route::get('/profile/{id}', [ProfileController::class, 'show'])->whereNumber('id');
    Route::get('/my-timesheets', MyTimesheetController::class);

    // Estimate requests
    Route::get('/estimate-request-forms', [EstimateRequestController::class, 'forms']);
    Route::post('/estimate-request-forms', [EstimateRequestController::class, 'storeForm']);
    Route::put('/estimate-request-forms/{form}', [EstimateRequestController::class, 'updateForm']);
    Route::delete('/estimate-request-forms/{form}', [EstimateRequestController::class, 'destroyForm']);
    Route::get('/estimate-requests', [EstimateRequestController::class, 'index']);
    Route::get('/estimate-requests/{estimateRequest}', [EstimateRequestController::class, 'show']);
    Route::patch('/estimate-requests/{estimateRequest}', [EstimateRequestController::class, 'update']);
    Route::delete('/estimate-requests/{estimateRequest}', [EstimateRequestController::class, 'destroy']);
    Route::post('/estimate-requests/{estimateRequest}/convert', [EstimateRequestController::class, 'convert']);

    // Reports
    Route::get('/reports/management', ManagementDashboardController::class);
    Route::get('/reports/sales', [ReportController::class, 'sales']);
    Route::get('/reports/sales-charts', [ReportController::class, 'salesCharts']);
    Route::get('/reports/expenses', [ReportController::class, 'expenses']);
    Route::get('/reports/expenses-vs-income', [ReportController::class, 'expensesVsIncome']);
    Route::get('/reports/leads', [ReportController::class, 'leads']);
    Route::get('/reports/timesheets', [ReportController::class, 'timesheets']);
    Route::get('/reports/knowledge-base', [ReportController::class, 'knowledgeBase']);

    Route::get('/payments', [PaymentController::class, 'index']);
    Route::put('/payments/{payment}', [PaymentController::class, 'update']);
    Route::delete('/payments/{payment}', [PaymentController::class, 'destroy']);

    // Setup lists (currencies, taxes, payment modes, item / customer groups) and options
    Route::get('/setup/options', [SetupController::class, 'options']);
    Route::get('/app-options', [SetupController::class, 'appOptions']);
    Route::apiResource('tags', TagController::class)->only(['index', 'update', 'destroy']);
    Route::put('/setup/options', [SetupController::class, 'saveOptions']);
    Route::get('/setup/backups', [BackupController::class, 'index']);
    Route::post('/setup/backups', [BackupController::class, 'store']);
    Route::put('/setup/backups/settings', [BackupController::class, 'settings']);
    Route::get('/setup/backups/{name}', [BackupController::class, 'download'])->where('name', 'backup-[0-9-]+\.sql\.gz');
    Route::delete('/setup/backups/{name}', [BackupController::class, 'destroy'])->where('name', 'backup-[0-9-]+\.sql\.gz');
    Route::get('/setup/{list}', [SetupController::class, 'index']);
    Route::post('/setup/{list}', [SetupController::class, 'store']);
    Route::put('/setup/{list}/{id}', [SetupController::class, 'update'])->whereNumber('id');
    Route::delete('/setup/{list}/{id}', [SetupController::class, 'destroy'])->whereNumber('id');

    // Projects
    Route::get('/projects/pinned', [ProjectController::class, 'pinned']);
    Route::apiResource('projects', ProjectController::class);
    Route::prefix('projects/{project}')->group(function () {
        Route::post('/status', [ProjectController::class, 'changeStatus']);
        Route::post('/copy', [ProjectController::class, 'copy']);
        Route::post('/pin', [ProjectController::class, 'togglePin']);
        Route::get('/members', [ProjectController::class, 'members']);
        Route::put('/members', [ProjectController::class, 'syncMembers']);
        Route::get('/overview', [ProjectController::class, 'overview']);
        Route::get('/note', [ProjectController::class, 'note']);
        Route::put('/note', [ProjectController::class, 'saveNote']);
        Route::get('/activity', [ProjectController::class, 'activity']);
        Route::get('/timesheets', [ProjectController::class, 'timesheets']);
        Route::get('/gantt', [ProjectController::class, 'gantt']);
        Route::get('/invoice', [ProjectController::class, 'invoiceData']);
        Route::post('/invoice', [ProjectController::class, 'invoice']);

        Route::get('/milestones', [MilestoneController::class, 'index']);
        Route::post('/milestones', [MilestoneController::class, 'store']);
        Route::post('/milestones/reorder', [MilestoneController::class, 'reorder']);

        Route::get('/files', [AttachmentController::class, 'projectFiles']);
        Route::post('/files', [AttachmentController::class, 'uploadToProject']);
        Route::post('/files/link', [AttachmentController::class, 'linkToProject']);

        Route::get('/discussions', [DiscussionController::class, 'index']);
        Route::post('/discussions', [DiscussionController::class, 'store']);
    });

    Route::put('/milestones/{milestone}', [MilestoneController::class, 'update']);
    Route::delete('/milestones/{milestone}', [MilestoneController::class, 'destroy']);

    Route::get('/discussions/{discussion}', [DiscussionController::class, 'show']);
    Route::put('/discussions/{discussion}', [DiscussionController::class, 'update']);
    Route::delete('/discussions/{discussion}', [DiscussionController::class, 'destroy']);
    Route::post('/discussions/{discussion}/comments', [DiscussionController::class, 'storeComment']);
    Route::put('/discussion-comments/{discussionComment}', [DiscussionController::class, 'updateComment']);
    Route::delete('/discussion-comments/{discussionComment}', [DiscussionController::class, 'destroyComment']);

    Route::put('/files/{attachment}', [AttachmentController::class, 'update']);
    Route::get('/files/{attachment}/download', [AttachmentController::class, 'download']);
    Route::delete('/files/{attachment}', [AttachmentController::class, 'destroy']);

    // Tasks
    Route::post('/tasks/reorder', [TaskController::class, 'reorder']);
    Route::post('/tasks/bulk', [TaskController::class, 'bulk']);
    Route::get('/tasks/overview', [TaskController::class, 'overview']);
    Route::get('/checklist-templates', [TaskChecklistController::class, 'templates']);
    Route::delete('/checklist-templates/{checklistTemplate}', [TaskChecklistController::class, 'destroyTemplate']);
    Route::apiResource('tasks', TaskController::class);
    Route::prefix('tasks/{task}')->group(function () {
        Route::post('/status', [TaskController::class, 'changeStatus']);
        Route::post('/dates', [TaskController::class, 'dates']);
        Route::post('/priority', [TaskController::class, 'changePriority']);
        Route::post('/milestone', [TaskController::class, 'changeMilestone']);
        Route::post('/copy', [TaskController::class, 'copy']);

        Route::post('/assignees', [TaskPeopleController::class, 'addAssignee']);
        Route::delete('/assignees/{userId}', [TaskPeopleController::class, 'removeAssignee'])->whereNumber('userId');
        Route::post('/followers', [TaskPeopleController::class, 'addFollower']);
        Route::delete('/followers/{userId}', [TaskPeopleController::class, 'removeFollower'])->whereNumber('userId');

        Route::post('/checklist', [TaskChecklistController::class, 'store']);
        Route::post('/checklist/reorder', [TaskChecklistController::class, 'reorder']);

        Route::post('/comments', [TaskCommentController::class, 'store']);
        Route::post('/attachments', [AttachmentController::class, 'uploadToTask']);

        Route::post('/timers/start', [TimerController::class, 'start']);
        Route::post('/timesheets', [TimerController::class, 'store']);

        Route::post('/reminders', [TaskReminderController::class, 'store']);
    });

    Route::put('/checklist-items/{checklistItem}', [TaskChecklistController::class, 'update']);
    Route::delete('/checklist-items/{checklistItem}', [TaskChecklistController::class, 'destroy']);
    Route::put('/task-comments/{taskComment}', [TaskCommentController::class, 'update']);
    Route::delete('/task-comments/{taskComment}', [TaskCommentController::class, 'destroy']);
    Route::delete('/task-reminders/{taskReminder}', [TaskReminderController::class, 'destroy']);

    // Utilities → CSV Export
    Route::get('/exports', [ExportController::class, 'index']);
    Route::get('/exports/{type}', [ExportController::class, 'export'])->whereAlpha('type')->where('type', '[a-z_]+');

    // Saved list filters
    Route::apiResource('saved-filters', SavedFilterController::class)->except('show');

    // Proposal / contract templates
    Route::apiResource('templates', TemplateController::class);

    // Staff chat
    Route::prefix('chat')->group(function () {
        Route::get('/contacts', [ChatController::class, 'contacts']);
        Route::get('/unread', [ChatController::class, 'unread']);
        Route::post('/status', [ChatController::class, 'status']);
        Route::post('/typing', [ChatController::class, 'typingStart'])->middleware('throttle:120,1');
        Route::get('/files', [ChatController::class, 'files']);
        Route::get('/search', [ChatController::class, 'search']);
        Route::post('/settings', [ChatController::class, 'settings']);
        Route::post('/announce', [ChatController::class, 'announce']);
        Route::get('/customer-contacts', [ChatController::class, 'customerContactOptions']);
        Route::get('/customer/{contactId}', [ChatController::class, 'customerMessages'])->whereNumber('contactId');
        Route::post('/customer/{contactId}', [ChatController::class, 'sendCustomer'])->whereNumber('contactId');
        Route::get('/direct/{userId}', [ChatController::class, 'directMessages'])->whereNumber('userId');
        Route::post('/direct/{userId}', [ChatController::class, 'sendDirect'])->whereNumber('userId');
        Route::delete('/messages/{chatMessage}', [ChatController::class, 'destroyMessage']);
        Route::post('/groups', [ChatController::class, 'storeGroup']);
        Route::put('/groups/{chatGroup}', [ChatController::class, 'updateGroup']);
        Route::delete('/groups/{chatGroup}', [ChatController::class, 'destroyGroup']);
        Route::get('/groups/{chatGroup}/messages', [ChatController::class, 'groupMessages']);
        Route::post('/groups/{chatGroup}/messages', [ChatController::class, 'sendGroup']);
        Route::post('/groups/{chatGroup}/members', [ChatController::class, 'addMembers']);
        Route::delete('/groups/{chatGroup}/members/{userId}', [ChatController::class, 'removeMember'])->whereNumber('userId');
    });

    // Timers / timesheets
    Route::get('/timers/running', [TimerController::class, 'running']);
    Route::post('/timers/start', [TimerController::class, 'startBlank']);
    Route::get('/timers/assignable-tasks', [TimerController::class, 'assignableTasks']);
    Route::delete('/timers/{timer}', [TimerController::class, 'discard']);
    Route::post('/timers/{timer}/stop', [TimerController::class, 'stop']);
    Route::put('/timesheets/{timer}', [TimerController::class, 'update']);
    Route::delete('/timesheets/{timer}', [TimerController::class, 'destroy']);

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    // Settings
    Route::get('/settings/permissions', [PermissionController::class, 'index']);
    Route::put('/settings/permissions/{userId}', [PermissionController::class, 'update'])->whereNumber('userId');
});
