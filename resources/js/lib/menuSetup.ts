import {
    BarChart3,
    BookOpen,
    Boxes,
    Briefcase,
    Building2,
    Calendar,
    ClipboardList,
    FileSignature,
    FileText,
    FolderKanban,
    Gauge,
    Globe,
    Handshake,
    Headphones,
    Heart,
    Inbox,
    LayoutGrid,
    LifeBuoy,
    ListChecks,
    Mail,
    MessageCircle,
    Megaphone,
    PieChart,
    Receipt,
    Settings,
    ShoppingCart,
    Star,
    Target,
    Truck,
    Users,
    Wallet,
    Wrench,
    type LucideIcon,
} from 'lucide-react';

/** One menu entry as a company set it up: its place is its position in the list. */
export interface MenuEntry {
    id: string;
    hidden?: boolean;
    /** Its own name instead of the default one. */
    label?: string;
    /** One of MENU_ICONS (top-level sidebar entries only). */
    icon?: string;
    children?: MenuEntry[];
}

/** Icons a sidebar entry can take. */
export const MENU_ICONS: Record<string, LucideIcon> = {
    Gauge,
    MessageCircle,
    Building2,
    Receipt,
    Wallet,
    FileSignature,
    FolderKanban,
    ListChecks,
    LifeBuoy,
    Target,
    Inbox,
    BookOpen,
    ShoppingCart,
    BarChart3,
    Wrench,
    Settings,
    Users,
    Briefcase,
    Calendar,
    ClipboardList,
    FileText,
    Globe,
    Handshake,
    Headphones,
    Heart,
    LayoutGrid,
    Mail,
    Megaphone,
    PieChart,
    Star,
    Truck,
    Boxes,
};

export interface SidebarDefault {
    id: string;
    label: string;
    icon: keyof typeof MENU_ICONS;
    /** The section's own colour (its icon chip). */
    color: string;
    to?: string;
    children?: { id: string; label: string; to: string }[];
}

/** The sidebar as it comes (Perfex's order). A link's id is its address; a section's id is its name. */
export const SIDEBAR_DEFAULT: SidebarDefault[] = [
    { id: '/', label: 'Dashboard', to: '/', icon: 'Gauge', color: '#60a5fa' },
    { id: '/chat', label: 'Chat', to: '/chat', icon: 'MessageCircle', color: '#34d399' },
    { id: '/customers', label: 'Customers', to: '/customers', icon: 'Building2', color: '#a78bfa' },
    {
        id: 'sales',
        label: 'Sales',
        icon: 'Receipt',
        color: '#4ade80',
        children: [
            { id: '/proposals', label: 'Proposals', to: '/proposals' },
            { id: '/estimates', label: 'Estimates', to: '/estimates' },
            { id: '/invoices', label: 'Invoices', to: '/invoices' },
            { id: '/payments', label: 'Payments', to: '/payments' },
            { id: '/credit-notes', label: 'Credit Notes', to: '/credit-notes' },
            { id: '/items', label: 'Items', to: '/items' },
        ],
    },
    { id: '/expenses', label: 'Expenses', to: '/expenses', icon: 'Wallet', color: '#f472b6' },
    { id: '/contracts', label: 'Contracts', to: '/contracts', icon: 'FileSignature', color: '#facc15' },
    { id: '/projects', label: 'Projects', to: '/projects', icon: 'FolderKanban', color: '#38bdf8' },
    { id: '/tasks', label: 'Tasks', to: '/tasks', icon: 'ListChecks', color: '#fb923c' },
    { id: '/tickets', label: 'Support', to: '/tickets', icon: 'LifeBuoy', color: '#22d3ee' },
    { id: '/leads', label: 'Leads', to: '/leads', icon: 'Target', color: '#fa6010' },
    { id: '/estimate-requests', label: 'Estimate Request', to: '/estimate-requests', icon: 'Inbox', color: '#c084fc' },
    { id: '/knowledge-base', label: 'Knowledge Base', to: '/knowledge-base', icon: 'BookOpen', color: '#fbbf24' },
    {
        id: 'purchase',
        label: 'Purchase',
        icon: 'ShoppingCart',
        color: '#2dd4bf',
        children: [
            { id: '/purchase/vendors', label: 'Vendors', to: '/purchase/vendors' },
            { id: '/purchase/requests', label: 'Purchase Requests', to: '/purchase/requests' },
            { id: '/purchase/orders', label: 'Purchase Orders', to: '/purchase/orders' },
            { id: '/purchase/invoices', label: 'Purchase Invoices', to: '/purchase/invoices' },
            { id: '/purchase/settings', label: 'Settings', to: '/purchase/settings' },
        ],
    },
    {
        id: 'accounting',
        label: 'Accounting',
        icon: 'BarChart3',
        color: '#818cf8',
        children: [
            { id: '/accounting/chart-of-accounts', label: 'Chart of Accounts', to: '/accounting/chart-of-accounts' },
            { id: '/accounting/journal-entries', label: 'Journal Entries', to: '/accounting/journal-entries' },
            { id: '/accounting/transfers', label: 'Transfers', to: '/accounting/transfers' },
            { id: '/accounting/reports', label: 'Reports', to: '/accounting/reports' },
        ],
    },
    {
        id: 'utilities',
        label: 'Utilities',
        icon: 'Wrench',
        color: '#94a3b8',
        children: [
            { id: '/utilities/media', label: 'Media', to: '/utilities/media' },
            { id: '/utilities/bulk-pdf', label: 'Bulk PDF Export', to: '/utilities/bulk-pdf' },
            { id: '/utilities/csv-export', label: 'CSV Export', to: '/utilities/csv-export' },
            { id: '/utilities/calendar', label: 'Calendar', to: '/utilities/calendar' },
            { id: '/utilities/announcements', label: 'Announcements', to: '/utilities/announcements' },
            { id: '/utilities/activity-log', label: 'Activity Log', to: '/utilities/activity-log' },
            { id: '/utilities/goals', label: 'Goals', to: '/utilities/goals' },
            { id: '/utilities/surveys', label: 'Surveys', to: '/utilities/surveys' },
        ],
    },
    {
        id: 'reports',
        label: 'Reports',
        icon: 'BarChart3',
        color: '#f87171',
        children: [
            { id: '/reports/management', label: 'Management dashboard', to: '/reports/management' },
            { id: '/reports/sales', label: 'Sales', to: '/reports/sales' },
            { id: '/reports/expenses', label: 'Expenses', to: '/reports/expenses' },
            { id: '/reports/expenses-vs-income', label: 'Expenses vs Income', to: '/reports/expenses-vs-income' },
            { id: '/reports/leads', label: 'Leads', to: '/reports/leads' },
            { id: '/reports/timesheets', label: 'Timesheets Overview', to: '/reports/timesheets' },
            { id: '/reports/knowledge-base', label: 'KB Articles', to: '/reports/knowledge-base' },
        ],
    },
    { id: '/settings', label: 'Setup', to: '/settings', icon: 'Settings', color: '#cbd5e1' },
];

/** Entries that can never be hidden: the way back to Setup and to Menu Setup itself. */
export const ALWAYS_SHOWN = ['/settings', 'misc', 'menu-setup'];

/** A company's saved menu, or null when it keeps the default one. */
export function parseMenu(json: string | null | undefined): MenuEntry[] | null {
    if (!json) {
        return null;
    }
    try {
        const value = JSON.parse(json);
        return Array.isArray(value) ? (value as MenuEntry[]) : null;
    } catch {
        return null;
    }
}

/**
 * The default entries in the company's order, with its names, icons and hidden flags. Entries the
 * company never saw (added to the app later) keep their place after their default neighbour.
 */
export function arrange<T extends { id: string }>(defaults: T[], config: MenuEntry[] | null | undefined): { item: T; entry: MenuEntry | undefined }[] {
    const index = new Map((config ?? []).map((e, i) => [e.id, i]));
    let previous = -1;
    const ranked = defaults.map((item, order) => {
        const at = index.get(item.id);
        const rank = at !== undefined ? at : previous + 0.001 * (order + 1);
        previous = at !== undefined ? at : rank;

        return { item, rank, entry: config?.find((e) => e.id === item.id) };
    });

    return ranked.sort((a, b) => a.rank - b.rank).map(({ item, entry }) => ({ item, entry }));
}
