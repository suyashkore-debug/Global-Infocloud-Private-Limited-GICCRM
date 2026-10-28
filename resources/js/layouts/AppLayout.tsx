import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    BarChart3,
    BookOpen,
    Building2,
    ChevronDown,
    ChevronRight,
    Clock,
    FileSignature,
    FolderKanban,
    Gauge,
    Inbox,
    LifeBuoy,
    ListChecks,
    LogOut,
    Menu as MenuIcon,
    MessageCircle,
    MonitorSmartphone,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Receipt,
    Search,
    Settings,
    Sun,
    ShoppingCart,
    Target,
    Wallet,
    Wrench,
    UserPen,
    UserRound,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import BrandLogo from '../components/brand/BrandLogo';
import { PROJECT_STATUSES, optionById } from '../lib/constants';
import { PROJECT_CHANGED } from '../lib/events';
import { useApi } from '../hooks/useApi';
import { useEvent } from '../hooks/useEvent';
import { usePermission } from '../hooks/usePermission';
import { useAppOptions } from '../hooks/useAppOptions';
import { setDatePickerWeekStart } from '../components/ui/DatePicker';
import { startRealtime } from '../lib/realtime';
import { useInstallApp } from '../lib/pwa';
import { api } from '../lib/api';
import { Avatar, Menu, MenuItem } from '../components/ui';
import { TaskModalHost, useTaskModals } from '../components/tasks/TaskModalHost';
import CommandPalette, { type PaletteAction, type PaletteLink } from './CommandPalette';
import { Breadcrumbs, CrumbProvider } from './Breadcrumbs';
import { ChatIcon, CompanySwitcher, NewsfeedIcon, NotificationsBell, TodosIcon } from './HeaderWidgets';

interface MenuNode {
    label: string;
    to?: string;
    icon?: LucideIcon;
    show?: boolean;
    /** Not built yet in this app. */
    soon?: boolean;
    children?: MenuNode[];
}

/**
 * Perfex admin layout: white header across the top (logo, search, quick create, timers,
 * notifications, profile) and the light sidebar menu in Perfex's order.
 */
export default function AppLayout() {
    const appOptions = useAppOptions();
    const { user } = useAuth();
    // Live updates (chat, notifications) on the user's own channel and, for staff who chat with
    // customers, the company's customer-chat channel (refused quietly for the rest).
    const companyId = user?.company?.id ?? user?.company_id;
    useEffect(() => {
        if (!user?.id) {
            return;
        }

        return startRealtime('staff', [`projects.user.${user.id}`, `projects.company.${companyId}.customers`], (body) => api.post('/realtime/auth', body));
    }, [user?.id, companyId]);
    useEffect(() => {
        if (appOptions) {
            setDatePickerWeekStart(Number(appOptions.calendar_first_day ?? 1) || 0);
        }
    }, [appOptions]);

    return (
        <TaskModalHost>
            <CrumbProvider>
                <Shell />
            </CrumbProvider>
        </TaskModalHost>
    );
}

function Shell() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const { newTask } = useTaskModals();
    const [logoFailed, setLogoFailed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const { canInstall, install } = useInstallApp();
    // Desktop sidebar: full (230px) or icons only (72px); remembered on this browser.
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem('sidebar_collapsed') === '1';
        } catch {
            return false;
        }
    });
    // Light / dark look, remembered on this browser; only the staff screens switch.
    const [dark, setDark] = useState(() => {
        try {
            return localStorage.getItem('crm_theme') === 'dark';
        } catch {
            return false;
        }
    });
    useLayoutEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        try {
            localStorage.setItem('crm_theme', dark ? 'dark' : 'light');
        } catch {
            // Storage blocked: the choice lasts for this page only.
        }

        return () => document.documentElement.classList.remove('dark');
    }, [dark]);
    const toggleCollapsed = () =>
        setCollapsed((c) => {
            try {
                localStorage.setItem('sidebar_collapsed', c ? '0' : '1');
            } catch {
                // Storage blocked: the choice lasts for this page only.
            }
            return !c;
        });
    const canCustomers = usePermission('customers.view');
    const canCreateProject = usePermission('projects.create');
    const canCreateTask = usePermission('tasks.create');
    const canInvoicesAll = usePermission('invoices.view');
    const canInvoicesOwn = usePermission('invoices.view_own');
    const canInvoices = canInvoicesAll || canInvoicesOwn;
    const canEstimatesAll = usePermission('estimates.view');
    const canEstimatesOwn = usePermission('estimates.view_own');
    const canEstimates = canEstimatesAll || canEstimatesOwn;
    const canProposalsAll = usePermission('proposals.view');
    const canProposalsOwn = usePermission('proposals.view_own');
    const canProposals = canProposalsAll || canProposalsOwn;
    const canCreditNotesAll = usePermission('credit_notes.view');
    const canCreditNotesOwn = usePermission('credit_notes.view_own');
    const canCreditNotes = canCreditNotesAll || canCreditNotesOwn;
    const canCreateEstimate = usePermission('estimates.create');
    const canExpensesAll = usePermission('expenses.view');
    const canExpensesOwn = usePermission('expenses.view_own');
    const canExpenses = canExpensesAll || canExpensesOwn;
    const canReports = usePermission('reports.view');
    const canSurveys = usePermission('surveys.view');
    const canAccounting = usePermission('accounting.view');
    const canVendors = usePermission('purchase_vendors.view');
    const prView = usePermission('purchase_requests.view');
    const prOwn = usePermission('purchase_requests.view_own');
    const prCreate = usePermission('purchase_requests.create');
    const poView = usePermission('purchase_orders.view');
    const poOwn = usePermission('purchase_orders.view_own');
    const canPurchaseInvoices = usePermission('purchase_invoices.view');
    const canPurchaseRequests = prView || prOwn || prCreate;
    const canPurchaseOrders = poView || poOwn;
    const canEstimateRequestsAll = usePermission('estimate_request.view');
    const canEstimateRequestsOwn = usePermission('estimate_request.view_own');
    const canEstimateRequests = canEstimateRequestsAll || canEstimateRequestsOwn;
    const canContractsAll = usePermission('contracts.view');
    const canContractsOwn = usePermission('contracts.view_own');
    const canContracts = canContractsAll || canContractsOwn;
    const canCreateExpense = usePermission('expenses.create');
    const canCreateContract = usePermission('contracts.create');
    const canCreateProposal = usePermission('proposals.create');
    const canPayments = usePermission('payments.view');
    const canCreateInvoice = usePermission('invoices.create');
    const pinned = useApi<{ data: { id: number; name: string; status: number; progress: number }[] }>('/projects/pinned');
    useEvent([PROJECT_CHANGED], pinned.reload);

    useEffect(() => setMobileOpen(false), [location.pathname]);

    // Ctrl+K / ⌘K opens the quick search from anywhere.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen((o) => !o);
            }
        };
        document.addEventListener('keydown', onKey);

        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const menu: MenuNode[] = [
        { label: 'Dashboard', to: '/', icon: Gauge },
        { label: 'Chat', to: '/chat', icon: MessageCircle },
        { label: 'Customers', to: '/customers', icon: Building2, show: canCustomers },
        {
            label: 'Sales',
            icon: Receipt,
            children: [
                { label: 'Proposals', to: '/proposals', show: canProposals },
                { label: 'Estimates', to: '/estimates', show: canEstimates },
                { label: 'Invoices', to: '/invoices', show: canInvoices },
                { label: 'Payments', to: '/payments', show: canPayments },
                { label: 'Credit Notes', to: '/credit-notes', show: canCreditNotes },
                { label: 'Items', to: '/items' },
            ],
        },
        { label: 'Expenses', to: '/expenses', icon: Wallet, show: canExpenses },
        { label: 'Contracts', to: '/contracts', icon: FileSignature, show: canContracts },
        { label: 'Projects', to: '/projects', icon: FolderKanban },
        { label: 'Tasks', to: '/tasks', icon: ListChecks },
        { label: 'Support', to: '/tickets', icon: LifeBuoy },
        { label: 'Leads', to: '/leads', icon: Target },
        { label: 'Estimate Request', to: '/estimate-requests', icon: Inbox, show: canEstimateRequests },
        { label: 'Knowledge Base', to: '/knowledge-base', icon: BookOpen },
        {
            label: 'Purchase',
            icon: ShoppingCart,
            show: canVendors || canPurchaseRequests || canPurchaseOrders || canPurchaseInvoices,
            children: [
                { label: 'Vendors', to: '/purchase/vendors', show: canVendors },
                { label: 'Purchase Requests', to: '/purchase/requests', show: canPurchaseRequests },
                { label: 'Purchase Orders', to: '/purchase/orders', show: canPurchaseOrders },
                { label: 'Purchase Invoices', to: '/purchase/invoices', show: canPurchaseInvoices },
                { label: 'Settings', to: '/purchase/settings', show: !!user?.is_admin },
            ],
        },
        {
            label: 'Accounting',
            icon: BarChart3,
            show: canAccounting,
            children: [
                { label: 'Chart of Accounts', to: '/accounting/chart-of-accounts' },
                { label: 'Journal Entries', to: '/accounting/journal-entries' },
                { label: 'Transfers', to: '/accounting/transfers' },
                { label: 'Reports', to: '/accounting/reports' },
            ],
        },
        {
            label: 'Utilities',
            icon: Wrench,
            children: [
                { label: 'Media', to: '/utilities/media' },
                { label: 'Bulk PDF Export', to: '/utilities/bulk-pdf' },
                { label: 'CSV Export', to: '/utilities/csv-export' },
                { label: 'Calendar', to: '/utilities/calendar' },
                { label: 'Announcements', to: '/utilities/announcements' },
                { label: 'Activity Log', to: '/utilities/activity-log', show: !!user?.is_admin },
                { label: 'Goals', to: '/utilities/goals' },
                { label: 'Surveys', to: '/utilities/surveys', show: canSurveys },
            ],
        },
        {
            label: 'Reports',
            icon: BarChart3,
            show: canReports,
            children: [
                { label: 'Management dashboard', to: '/reports/management' },
                { label: 'Sales', to: '/reports/sales' },
                { label: 'Expenses', to: '/reports/expenses' },
                { label: 'Expenses vs Income', to: '/reports/expenses-vs-income' },
                { label: 'Leads', to: '/reports/leads' },
                { label: 'Timesheets Overview', to: '/reports/timesheets' },
                { label: 'KB Articles', to: '/reports/knowledge-base' },
            ],
        },
        { label: 'Setup', to: '/settings', icon: Settings, show: !!user?.is_admin },
    ];

    // Accordion: one sidebar section open at a time; it follows the page you are on.
    const sectionOf = (path: string) => menu.find((node) => node.children?.some((child) => child.to && path.startsWith(child.to)))?.label ?? null;
    const [openSection, setOpenSection] = useState<string | null>(() => sectionOf(location.pathname));
    useEffect(() => {
        const current = sectionOf(location.pathname);
        if (current) {
            setOpenSection(current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    // Quick search (Ctrl+K): every page the sidebar offers this user, and the quick-create actions.
    const paletteLinks: PaletteLink[] = menu.flatMap((node) =>
        node.show === false || node.soon
            ? []
            : node.children
              ? node.children.filter((c) => c.show !== false && !c.soon && c.to).map((c) => ({ label: c.label, to: c.to!, icon: node.icon, section: node.label }))
              : node.to
                ? [{ label: node.label, to: node.to, icon: node.icon }]
                : [],
    );
    const paletteActions: PaletteAction[] = [
        canCreateTask && { label: 'Task', icon: ListChecks, run: () => newTask() },
        canCreateProject && { label: 'Project', icon: FolderKanban, run: () => navigate('/projects?new=1') },
        canCustomers && { label: 'Customer', icon: Building2, run: () => navigate('/customers/new') },
        canCreateInvoice && { label: 'Invoice', icon: Receipt, run: () => navigate('/invoices/new') },
        canCreateEstimate && { label: 'Estimate', icon: Receipt, run: () => navigate('/estimates/new') },
        canCreateProposal && { label: 'Proposal', icon: FileSignature, run: () => navigate('/proposals/new') },
        { label: 'Ticket', icon: LifeBuoy, run: () => navigate('/tickets/new') },
    ].filter((a): a is PaletteAction => !!a);

    // Perfex profile menu (sidebar and header): My Profile, My Timesheets, Edit Profile, Logout.
    const profileItems = (close: () => void) => (
        <>
            <MenuItem onClick={() => (close(), navigate('/profile'))}>
                <UserRound className="h-4 w-4" /> My Profile
            </MenuItem>
            <MenuItem onClick={() => (close(), navigate('/timesheets'))}>
                <Clock className="h-4 w-4" /> My Timesheets
            </MenuItem>
            <MenuItem onClick={() => (close(), navigate('/profile/edit'))}>
                <UserPen className="h-4 w-4" /> Edit Profile
            </MenuItem>
            {canInstall && (
                <MenuItem onClick={() => (close(), install())}>
                    <MonitorSmartphone className="h-4 w-4" /> Install app
                </MenuItem>
            )}
            <MenuItem onClick={() => (close(), logout())}>
                <LogOut className="h-4 w-4" /> Logout
            </MenuItem>
        </>
    );

    const renderSidebar = (compact: boolean) => (
        <div className="flex h-full flex-col">
            <div className={compact ? 'flex justify-center px-2 pt-4' : 'px-3 pt-4'}>
                <Menu
                    align="left"
                    block
                    trigger={(toggle) => (
                        <button
                            type="button"
                            onClick={toggle}
                            title={compact ? `${user?.full_name ?? ''} · ${user?.email ?? ''}` : (user?.email ?? undefined)}
                            className={`flex items-center gap-3 rounded-xl bg-white/[0.06] text-left text-white ring-1 ring-white/10 transition hover:bg-white/10 ${compact ? 'p-1.5' : 'w-full px-2.5 py-2.5'}`}
                        >
                            <Avatar id={user?.id} name={user?.full_name} photo={user?.photo_url} />
                            <span className={compact ? 'hidden' : 'min-w-0 flex-1'}>
                                <span className="block truncate text-[13.5px] font-semibold">{user?.full_name}</span>
                                <span className="block truncate text-[12px] text-blue-100/60">{user?.email}</span>
                            </span>
                            {!compact && <ChevronDown className="h-4 w-4 shrink-0 text-blue-100/50" />}
                        </button>
                    )}
                >
                    {(close) => profileItems(close)}
                </Menu>
            </div>
            <nav className={`sidebar-scroll flex-1 overflow-y-auto pb-6 pt-4 ${compact ? 'px-2' : 'px-3'}`}>
                {!compact && <p className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-blue-100/40">Menu</p>}
                <ul className="space-y-0.5">
                    {menu
                        .filter((item) => item.show !== false)
                        .map((item) => (
                            <SidebarItem
                                key={item.label}
                                item={item}
                                pathname={location.pathname}
                                compact={compact}
                                open={openSection === item.label}
                                onToggle={() => setOpenSection((current) => (current === item.label ? null : item.label))}
                            />
                        ))}
                </ul>

                {!compact && (pinned.data?.data.length ?? 0) > 0 && (
                    <div className="mt-5 border-t border-white/10 pt-4">
                        <p className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-blue-100/40">Pinned projects</p>
                        <ul>
                            {pinned.data?.data.map((project) => (
                                <li key={project.id}>
                                    <NavLink to={`/projects/${project.id}`} className="block rounded-lg px-3 py-1.5 text-[13px] text-blue-100/80 hover:bg-white/[0.07] hover:text-white">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: optionById(PROJECT_STATUSES, project.status)?.color }} />
                                            <span className="truncate">{project.name}</span>
                                        </span>
                                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                                            <span className="block h-full bg-accent" style={{ width: `${project.progress}%` }} />
                                        </span>
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </nav>
            <div className={`hidden border-t border-white/10 py-2 lg:block ${compact ? 'px-2' : 'px-3'}`}>
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    title={compact ? 'Expand the menu' : 'Collapse the menu'}
                    className={`flex w-full items-center gap-3 rounded-lg py-2 text-[13px] font-medium text-blue-100/60 transition hover:bg-white/[0.07] hover:text-white ${compact ? 'justify-center' : 'px-3'}`}
                >
                    {compact ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
                    {!compact && 'Collapse menu'}
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen">
            <header className="fixed inset-x-0 top-0 z-30 flex h-[57px] items-center gap-2 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur sm:px-4">
                <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Menu">
                    <MenuIcon className="h-5 w-5" />
                </button>
                <Link to="/" className="mr-2 hidden h-[57px] w-[226px] shrink-0 items-center sm:flex" title={user?.company?.company_name ?? 'GIC Folks CRM'}>
                    {/* The signed-in company's HRMS logo; GIC Folks CRM when it has none. */}
                    {user?.company?.logo_url && !logoFailed ? (
                        <img src={user.company.logo_url} alt={user.company.company_name} className="logo-plate max-h-10 max-w-[210px] object-contain" onError={() => setLogoFailed(true)} />
                    ) : (
                        <BrandLogo size="sm" />
                    )}
                </Link>
                {user?.is_super_admin && <CompanySwitcher currentName={user.company?.company_name ?? 'Company'} acting={!!user.is_super_admin_acting} />}
                <button
                    type="button"
                    onClick={() => setPaletteOpen(true)}
                    className="group flex h-[38px] min-w-0 max-w-xl flex-1 items-center gap-2.5 rounded-full bg-slate-100 pl-3.5 pr-2 text-left text-[13.5px] text-slate-400 transition hover:bg-slate-200/70"
                >
                    <Search className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">Search projects, tasks, customers…</span>
                    <span className="hidden items-center gap-0.5 sm:flex">
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-slate-500 shadow-sm">Ctrl</kbd>
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-slate-500 shadow-sm">K</kbd>
                    </span>
                </button>
                <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} links={paletteLinks} actions={paletteActions} />
                <div className="ml-auto flex items-center gap-1">
                    <Menu
                        trigger={(toggle) => (
                            <button type="button" onClick={toggle} title="Quick create" className="mr-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-light">
                                <Plus className="h-5 w-5" />
                            </button>
                        )}
                    >
                        {(close) => (
                            <>
                                {canCreateProject && (
                                    <MenuItem onClick={() => (close(), navigate('/projects?new=1'))}>
                                        <FolderKanban className="h-4 w-4" /> Project
                                    </MenuItem>
                                )}
                                {canCreateTask && (
                                    <MenuItem onClick={() => (close(), newTask())}>
                                        <ListChecks className="h-4 w-4" /> Task
                                    </MenuItem>
                                )}
                                {canCreateInvoice && (
                                    <MenuItem onClick={() => (close(), navigate('/invoices/new'))}>
                                        <Receipt className="h-4 w-4" /> Invoice
                                    </MenuItem>
                                )}
                                {canCreateEstimate && (
                                    <MenuItem onClick={() => (close(), navigate('/estimates/new'))}>
                                        <Receipt className="h-4 w-4" /> Estimate
                                    </MenuItem>
                                )}
                                {canCreateProposal && (
                                    <MenuItem onClick={() => (close(), navigate('/proposals/new'))}>
                                        <FileSignature className="h-4 w-4" /> Proposal
                                    </MenuItem>
                                )}
                                {canCreateExpense && (
                                    <MenuItem onClick={() => (close(), navigate('/expenses/new'))}>
                                        <Wallet className="h-4 w-4" /> Expense
                                    </MenuItem>
                                )}
                                {canCreateContract && (
                                    <MenuItem onClick={() => (close(), navigate('/contracts/new'))}>
                                        <FileSignature className="h-4 w-4" /> Contract
                                    </MenuItem>
                                )}
                                <MenuItem onClick={() => (close(), navigate('/leads'))}>
                                    <Target className="h-4 w-4" /> Lead
                                </MenuItem>
                                <MenuItem onClick={() => (close(), navigate('/tickets/new'))}>
                                    <LifeBuoy className="h-4 w-4" /> Ticket
                                </MenuItem>
                                {canCustomers && (
                                    <MenuItem onClick={() => (close(), navigate('/customers/new'))}>
                                        <Building2 className="h-4 w-4" /> Customer
                                    </MenuItem>
                                )}
                            </>
                        )}
                    </Menu>
                    <button
                        type="button"
                        onClick={() => setDark((d) => !d)}
                        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                        className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    >
                        {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                    </button>
                    <NewsfeedIcon />
                    <TodosIcon />
                    <ChatIcon />
                    <NotificationsBell />
                    <Menu
                        trigger={(toggle) => (
                            <button type="button" onClick={toggle} className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100">
                                <Avatar id={user?.id} name={user?.full_name} photo={user?.photo_url} />
                                <span className="hidden max-w-[9rem] truncate text-[13px] font-semibold text-slate-700 xl:block">{user?.first_name || user?.full_name}</span>
                                <ChevronDown className="hidden h-4 w-4 text-slate-400 xl:block" />
                            </button>
                        )}
                    >
                        {(close) => (
                            <>
                                <div className="mb-1 border-b border-slate-100 px-2.5 pb-2 pt-1.5">
                                    <p className="font-semibold text-slate-800">{user?.full_name}</p>
                                    <p className="text-xs text-slate-500">{user?.is_admin ? 'Administrator' : user?.email}</p>
                                </div>
                                {profileItems(close)}
                            </>
                        )}
                    </Menu>
                </div>
            </header>

            <aside className={`sidebar-brand fixed bottom-0 left-0 top-[57px] z-20 hidden transition-[width] duration-200 lg:block ${collapsed ? 'w-[72px]' : 'w-[230px]'}`}>{renderSidebar(collapsed)}</aside>
            {mobileOpen && (
                <div className="fixed inset-0 top-[57px] z-40 lg:hidden">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
                    <aside className="sidebar-brand absolute inset-y-0 left-0 w-[260px] shadow-2xl">{renderSidebar(false)}</aside>
                </div>
            )}

            <main className={`px-4 pb-10 pt-[81px] transition-[margin] duration-200 sm:px-6 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[230px]'}`}>
                {/* Every page shares one content column (same left edge, capped on wide screens); chat uses the whole area. */}
                {location.pathname.startsWith('/chat') ? (
                    <Outlet />
                ) : (
                    <div className="mx-auto w-full max-w-[1440px]">
                        <Breadcrumbs links={paletteLinks} pathname={location.pathname} />
                        <Outlet />
                    </div>
                )}
            </main>
        </div>
    );
}

function SidebarItem({ item, pathname, compact = false, open, onToggle }: { item: MenuNode; pathname: string; compact?: boolean; open: boolean; onToggle: () => void }) {
    const childActive = item.children?.some((child) => child.to && pathname.startsWith(child.to)) ?? false;
    const Icon = item.icon;
    const base = 'relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition';

    if (compact) {
        return <CompactSidebarItem item={item} pathname={pathname} childActive={childActive} />;
    }

    if (item.children) {
        return (
            <li>
                <button type="button" onClick={onToggle} aria-expanded={open} className={`${base} ${childActive ? 'text-white' : 'text-blue-100/75 hover:bg-white/[0.07] hover:text-white'}`}>
                    {Icon && <Icon className={`h-[18px] w-[18px] ${childActive ? 'text-accent' : 'text-blue-100/50'}`} />}
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRight className={`h-4 w-4 text-blue-100/40 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && (
                    <ul className="mb-1 ml-[21px] mt-0.5 border-l border-white/10">
                        {item.children.filter((child) => child.show !== false).map((child) => (
                            <li key={child.label}>
                                {child.soon ? (
                                    <span className="flex cursor-not-allowed items-center py-1.5 pl-4 pr-3 text-[13px] text-blue-100/35">
                                        {child.label}
                                        <SoonBadge />
                                    </span>
                                ) : (
                                    <NavLink
                                        to={child.to!}
                                        className={({ isActive }) =>
                                            `-ml-px block border-l-2 py-1.5 pl-4 pr-3 text-[13px] transition ${isActive ? 'border-accent font-semibold text-white' : 'border-transparent text-blue-100/65 hover:border-white/30 hover:text-white'}`
                                        }
                                    >
                                        {child.label}
                                    </NavLink>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </li>
        );
    }

    if (item.soon) {
        return (
            <li>
                <span className={`${base} cursor-not-allowed text-blue-100/35`}>
                    {Icon && <Icon className="h-[18px] w-[18px]" />}
                    <span className="flex-1">{item.label}</span>
                    <SoonBadge />
                </span>
            </li>
        );
    }

    return (
        <li>
            <NavLink
                to={item.to!}
                end={item.to === '/'}
                className={({ isActive }) =>
                    `${base} ${isActive ? 'bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10' : 'text-blue-100/75 hover:bg-white/[0.07] hover:text-white'}`
                }
            >
                {({ isActive }) => (
                    <>
                        {isActive && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent" />}
                        {Icon && <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent' : 'text-blue-100/50'}`} />}
                        {item.label}
                    </>
                )}
            </NavLink>
        </li>
    );
}

/**
 * The icons-only sidebar: an icon with a tooltip; a section's pages open in a flyout beside it on
 * hover (fixed, so the scrolling menu doesn't clip it).
 */
function CompactSidebarItem({ item, pathname, childActive }: { item: MenuNode; pathname: string; childActive: boolean }) {
    const [flyout, setFlyout] = useState<{ top: number; left: number } | null>(null);
    const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const Icon = item.icon ?? Gauge;
    const show = (el: HTMLElement) => {
        clearTimeout(hide.current);
        const r = el.getBoundingClientRect();
        setFlyout({ top: Math.min(r.top, window.innerHeight - 40 - (item.children?.length ?? 0) * 34), left: r.right + 10 });
    };
    const leave = () => {
        hide.current = setTimeout(() => setFlyout(null), 120);
    };
    useEffect(() => () => clearTimeout(hide.current), []);
    useEffect(() => setFlyout(null), [pathname]);

    const iconClass = (active: boolean) =>
        `relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition ${active ? 'bg-white/[0.12] text-accent ring-1 ring-white/10' : 'text-blue-100/60 hover:bg-white/[0.07] hover:text-white'}`;

    if (item.soon) {
        return (
            <li>
                <span className={`${iconClass(false)} cursor-not-allowed opacity-40`} title={`${item.label} (soon)`}>
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </li>
        );
    }

    if (!item.children) {
        return (
            <li>
                <NavLink to={item.to!} end={item.to === '/'} title={item.label} aria-label={item.label} className={({ isActive }) => iconClass(isActive)}>
                    {({ isActive }) => (
                        <>
                            {isActive && <span className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-full bg-accent" />}
                            <Icon className="h-[18px] w-[18px]" />
                        </>
                    )}
                </NavLink>
            </li>
        );
    }

    return (
        <li onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={leave}>
            <button type="button" aria-label={item.label} aria-haspopup="menu" onClick={(e) => (flyout ? setFlyout(null) : show(e.currentTarget.parentElement!))} className={iconClass(childActive)}>
                {childActive && <span className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-full bg-accent" />}
                <Icon className="h-[18px] w-[18px]" />
            </button>
            {flyout && (
                <div
                    role="menu"
                    onMouseEnter={() => clearTimeout(hide.current)}
                    onMouseLeave={leave}
                    style={{ top: flyout.top, left: flyout.left }}
                    className="fixed z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                    <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                    {item.children
                        .filter((child) => child.show !== false)
                        .map((child) =>
                            child.soon ? (
                                <span key={child.label} className="flex items-center rounded-lg px-2.5 py-1.5 text-[13px] text-slate-300">
                                    {child.label}
                                </span>
                            ) : (
                                <NavLink
                                    key={child.label}
                                    to={child.to!}
                                    role="menuitem"
                                    className={({ isActive }) => `block rounded-lg px-2.5 py-1.5 text-[13px] transition ${isActive ? 'bg-brand-50 font-semibold text-brand' : 'text-slate-700 hover:bg-slate-100'}`}
                                >
                                    {child.label}
                                </NavLink>
                            ),
                        )}
                </div>
            )}
        </li>
    );
}

function SoonBadge() {
    return <span className="ml-auto rounded bg-white/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-blue-100/50">Soon</span>;
}
