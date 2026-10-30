import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerServiceWorker } from './lib/pwa';
import { enableTableSorting } from './lib/tableSort';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { ToastProvider } from './components/ui/Toast';
import AppLayout from './layouts/AppLayout';
import ContractFormPage from './pages/crm/ContractFormPage';
import ContractsPage from './pages/crm/ContractsPage';
import ContractViewPage from './pages/crm/ContractViewPage';
import ExpenseFormPage from './pages/crm/ExpenseFormPage';
import ExpensesPage from './pages/crm/ExpensesPage';
import ExpenseViewPage from './pages/crm/ExpenseViewPage';
import LeadsPage from './pages/crm/LeadsPage';
import LeadImportPage from './pages/crm/LeadImportPage';
import LeadFormsPage from './pages/crm/LeadFormsPage';
import PublicLeadFormPage from './pages/crm/PublicLeadFormPage';
import TicketFormPage from './pages/crm/TicketFormPage';
import TicketsPage from './pages/crm/TicketsPage';
import TicketViewPage from './pages/crm/TicketViewPage';
import KnowledgeBasePage from './pages/crm/KnowledgeBasePage';
import ActivityLogPage from './pages/utilities/ActivityLogPage';
import TodosPage from './pages/todos/TodosPage';
import TasksOverviewPage from './pages/TasksOverviewPage';
import ChatPage from './pages/chat/ChatPage';
import AccountingReportsPage from './pages/accounting/AccountingReportsPage';
import ChartOfAccountsPage, { AccountHistoryPage } from './pages/accounting/ChartOfAccountsPage';
import JournalEntriesPage, { JournalEntryFormPage } from './pages/accounting/JournalEntriesPage';
import TransfersPage from './pages/accounting/TransfersPage';
import PurchaseFormPage from './pages/purchase/PurchaseFormPage';
import PurchaseListPage from './pages/purchase/PurchaseListPage';
import PurchaseSettingsPage from './pages/purchase/PurchaseSettingsPage';
import PurchaseViewPage from './pages/purchase/PurchaseViewPage';
import VendorsPage, { VendorViewPage } from './pages/purchase/VendorsPage';
import { PortalForgotPage, PortalLoginPage, PortalSetPasswordPage } from './portal/AuthPages';
import PortalLayout from './portal/PortalLayout';
import { PortalCompany, PortalDashboard, PortalDocuments, PortalKnowledgeBase, PortalProfile, PortalProjects, PortalProjectView, PortalStatement, PortalTickets, PortalTicketView } from './portal/PortalPages';
import PublicDocumentPage from './pages/public/PublicDocumentPage';
import MailListsPage from './pages/surveys/MailListsPage';
import PublicSurveyPage from './pages/surveys/PublicSurveyPage';
import SurveyFormPage from './pages/surveys/SurveyFormPage';
import SurveyResultsPage from './pages/surveys/SurveyResultsPage';
import SurveysPage from './pages/surveys/SurveysPage';
import NewsfeedPage from './pages/newsfeed/NewsfeedPage';
import EditProfilePage from './pages/profile/EditProfilePage';
import MyProfilePage from './pages/profile/MyProfilePage';
import MyTimesheetsPage from './pages/profile/MyTimesheetsPage';
import EstimateRequestsPage from './pages/estimate-requests/EstimateRequestsPage';
import EstimateRequestViewPage from './pages/estimate-requests/EstimateRequestViewPage';
import EstimateRequestFormsPage from './pages/estimate-requests/FormsPage';
import PublicQuoteFormPage from './pages/estimate-requests/PublicQuoteFormPage';
import ExpensesReportPage from './pages/reports/ExpensesReportPage';
import ExpensesVsIncomePage from './pages/reports/ExpensesVsIncomePage';
import KnowledgeBaseReportPage from './pages/reports/KnowledgeBaseReportPage';
import LeadsReportPage from './pages/reports/LeadsReportPage';
import ManagementDashboardPage from './pages/reports/ManagementDashboardPage';
import SalesReportPage from './pages/reports/SalesReportPage';
import TimesheetsReportPage from './pages/reports/TimesheetsReportPage';
import AnnouncementsPage from './pages/utilities/AnnouncementsPage';
import BulkPdfPage from './pages/utilities/BulkPdfPage';
import CsvExportPage from './pages/utilities/CsvExportPage';
import CalendarPage from './pages/utilities/CalendarPage';
import GoalsPage from './pages/utilities/GoalsPage';
import MediaPage from './pages/utilities/MediaPage';
import CustomerPage from './pages/customers/CustomerPage';
import CustomersPage from './pages/customers/CustomersPage';
import CreditNotesPage from './pages/sales/CreditNotesPage';
import CreditNoteViewPage from './pages/sales/CreditNoteViewPage';
import DocumentFormPage from './pages/sales/DocumentFormPage';
import EstimatesPage from './pages/sales/EstimatesPage';
import EstimateViewPage from './pages/sales/EstimateViewPage';
import InvoiceFormPage from './pages/sales/InvoiceFormPage';
import InvoicesPage from './pages/sales/InvoicesPage';
import InvoiceViewPage from './pages/sales/InvoiceViewPage';
import ItemsPage from './pages/sales/ItemsPage';
import PaymentsPage from './pages/sales/PaymentsPage';
import ProposalFormPage from './pages/sales/ProposalFormPage';
import ProposalsPage from './pages/sales/ProposalsPage';
import ProposalViewPage from './pages/sales/ProposalViewPage';
import SetupPage from './pages/setup/SetupPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectViewPage from './pages/projects/ProjectViewPage';
import TasksPage from './pages/TasksPage';

registerServiceWorker();
enableTableSorting();

createRoot(document.getElementById('app')!).render(
    <StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/forms/quote/:key" element={<PublicQuoteFormPage />} />
                        <Route path="/forms/wtl/:key" element={<PublicLeadFormPage />} />
                        <Route path="/survey/:id/:hash" element={<PublicSurveyPage />} />
                        <Route path="/portal/login" element={<PortalLoginPage />} />
                        <Route path="/portal/forgot-password" element={<PortalForgotPage />} />
                        <Route path="/portal/set-password/:token" element={<PortalSetPasswordPage />} />
                        <Route path="/portal" element={<PortalLayout />}>
                            <Route index element={<PortalDashboard />} />
                            <Route path="invoices" element={<PortalDocuments type="invoices" />} />
                            <Route path="estimates" element={<PortalDocuments type="estimates" />} />
                            <Route path="proposals" element={<PortalDocuments type="proposals" />} />
                            <Route path="contracts" element={<PortalDocuments type="contracts" />} />
                            <Route path="statement" element={<PortalStatement />} />
                            <Route path="tickets" element={<PortalTickets />} />
                            <Route path="tickets/:id" element={<PortalTicketView />} />
                            <Route path="projects" element={<PortalProjects />} />
                            <Route path="projects/:id" element={<PortalProjectView />} />
                            <Route path="knowledge-base" element={<PortalKnowledgeBase />} />
                            <Route path="profile" element={<PortalProfile />} />
                            <Route path="company" element={<PortalCompany />} />
                        </Route>
                        <Route path="/invoice/:id/:hash" element={<PublicDocumentPage type="invoice" />} />
                        <Route path="/estimate/:id/:hash" element={<PublicDocumentPage type="estimate" />} />
                        <Route path="/proposal/:id/:hash" element={<PublicDocumentPage type="proposal" />} />
                        <Route path="/contract/:id/:hash" element={<PublicDocumentPage type="contract" />} />
                        <Route element={<RequireAuth />}>
                            <Route element={<AppLayout />}>
                                <Route index element={<DashboardPage />} />
                                <Route path="projects" element={<ProjectsPage />} />
                                <Route path="projects/:id" element={<ProjectViewPage />} />
                                <Route path="tasks" element={<TasksPage />} />
                                <Route path="tasks/overview" element={<TasksOverviewPage />} />
                                <Route path="chat" element={<ChatPage />} />
                                <Route path="customers" element={<CustomersPage />} />
                                <Route path="customers/:id" element={<CustomerPage />} />
                                <Route path="invoices" element={<InvoicesPage />} />
                                <Route path="invoices/new" element={<InvoiceFormPage />} />
                                <Route path="invoices/:id" element={<InvoiceViewPage />} />
                                <Route path="invoices/:id/edit" element={<InvoiceFormPage />} />
                                <Route path="estimates" element={<EstimatesPage />} />
                                <Route path="estimates/new" element={<DocumentFormPage kind="estimate" />} />
                                <Route path="estimates/:id" element={<EstimateViewPage />} />
                                <Route path="estimates/:id/edit" element={<DocumentFormPage kind="estimate" />} />
                                <Route path="credit-notes" element={<CreditNotesPage />} />
                                <Route path="credit-notes/new" element={<DocumentFormPage kind="credit-note" />} />
                                <Route path="credit-notes/:id" element={<CreditNoteViewPage />} />
                                <Route path="credit-notes/:id/edit" element={<DocumentFormPage kind="credit-note" />} />
                                <Route path="proposals" element={<ProposalsPage />} />
                                <Route path="proposals/new" element={<ProposalFormPage />} />
                                <Route path="proposals/:id" element={<ProposalViewPage />} />
                                <Route path="proposals/:id/edit" element={<ProposalFormPage />} />
                                <Route path="payments" element={<PaymentsPage />} />
                                <Route path="expenses" element={<ExpensesPage />} />
                                <Route path="expenses/new" element={<ExpenseFormPage />} />
                                <Route path="expenses/:id" element={<ExpenseViewPage />} />
                                <Route path="expenses/:id/edit" element={<ExpenseFormPage />} />
                                <Route path="contracts" element={<ContractsPage />} />
                                <Route path="contracts/new" element={<ContractFormPage />} />
                                <Route path="contracts/:id" element={<ContractViewPage />} />
                                <Route path="contracts/:id/edit" element={<ContractFormPage />} />
                                <Route path="leads" element={<LeadsPage />} />
                                <Route path="leads/import" element={<LeadImportPage />} />
                                <Route path="leads/forms" element={<LeadFormsPage />} />
                                <Route path="knowledge-base" element={<KnowledgeBasePage />} />
                                <Route path="utilities/media" element={<MediaPage />} />
                                <Route path="utilities/bulk-pdf" element={<BulkPdfPage />} />
                                <Route path="utilities/csv-export" element={<CsvExportPage />} />
                                <Route path="utilities/calendar" element={<CalendarPage />} />
                                <Route path="utilities/announcements" element={<AnnouncementsPage />} />
                                <Route path="utilities/activity-log" element={<ActivityLogPage />} />
                                <Route path="utilities/goals" element={<GoalsPage />} />
                                <Route path="newsfeed" element={<NewsfeedPage />} />
                                <Route path="utilities/surveys" element={<SurveysPage />} />
                                <Route path="utilities/surveys/new" element={<SurveyFormPage />} />
                                <Route path="utilities/surveys/:id" element={<SurveyFormPage />} />
                                <Route path="utilities/surveys/:id/results" element={<SurveyResultsPage />} />
                                <Route path="utilities/mail-lists" element={<MailListsPage />} />
                                <Route path="purchase/vendors" element={<VendorsPage />} />
                                <Route path="purchase/vendors/:id" element={<VendorViewPage />} />
                                <Route path="purchase/requests" element={<PurchaseListPage key="requests" type="requests" />} />
                                <Route path="purchase/requests/new" element={<PurchaseFormPage key="requests-new" type="requests" />} />
                                <Route path="purchase/requests/:id" element={<PurchaseViewPage key="requests-view" type="requests" />} />
                                <Route path="purchase/requests/:id/edit" element={<PurchaseFormPage key="requests-edit" type="requests" />} />
                                <Route path="purchase/orders" element={<PurchaseListPage key="orders" type="orders" />} />
                                <Route path="purchase/orders/new" element={<PurchaseFormPage key="orders-new" type="orders" />} />
                                <Route path="purchase/orders/:id" element={<PurchaseViewPage key="orders-view" type="orders" />} />
                                <Route path="purchase/orders/:id/edit" element={<PurchaseFormPage key="orders-edit" type="orders" />} />
                                <Route path="purchase/invoices" element={<PurchaseListPage key="invoices" type="invoices" />} />
                                <Route path="purchase/invoices/new" element={<PurchaseFormPage key="invoices-new" type="invoices" />} />
                                <Route path="purchase/invoices/:id" element={<PurchaseViewPage key="invoices-view" type="invoices" />} />
                                <Route path="purchase/invoices/:id/edit" element={<PurchaseFormPage key="invoices-edit" type="invoices" />} />
                                <Route path="purchase/settings" element={<PurchaseSettingsPage />} />
                                <Route path="accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
                                <Route path="accounting/accounts/:id" element={<AccountHistoryPage />} />
                                <Route path="accounting/journal-entries" element={<JournalEntriesPage />} />
                                <Route path="accounting/journal-entries/new" element={<JournalEntryFormPage />} />
                                <Route path="accounting/journal-entries/:id" element={<JournalEntriesPage />} />
                                <Route path="accounting/journal-entries/:id/edit" element={<JournalEntryFormPage />} />
                                <Route path="accounting/transfers" element={<TransfersPage />} />
                                <Route path="accounting/reports" element={<AccountingReportsPage />} />
                                <Route path="todos" element={<TodosPage />} />
                                <Route path="profile" element={<MyProfilePage />} />
                                <Route path="profile/edit" element={<EditProfilePage />} />
                                <Route path="profile/:id" element={<MyProfilePage />} />
                                <Route path="timesheets" element={<MyTimesheetsPage />} />
                                <Route path="estimate-requests" element={<EstimateRequestsPage />} />
                                <Route path="estimate-requests/forms" element={<EstimateRequestFormsPage />} />
                                <Route path="estimate-requests/:id" element={<EstimateRequestViewPage />} />
                                <Route path="reports/management" element={<ManagementDashboardPage />} />
                                <Route path="reports/sales" element={<SalesReportPage />} />
                                <Route path="reports/expenses" element={<ExpensesReportPage />} />
                                <Route path="reports/expenses-vs-income" element={<ExpensesVsIncomePage />} />
                                <Route path="reports/leads" element={<LeadsReportPage />} />
                                <Route path="reports/timesheets" element={<TimesheetsReportPage />} />
                                <Route path="reports/knowledge-base" element={<KnowledgeBaseReportPage />} />
                                <Route path="tickets" element={<TicketsPage />} />
                                <Route path="tickets/new" element={<TicketFormPage />} />
                                <Route path="tickets/:id" element={<TicketViewPage />} />
                                <Route path="items" element={<ItemsPage />} />
                                <Route path="settings" element={<SetupPage />} />
                            </Route>
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    </StrictMode>,
);
