import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Breadcrumbs for every page, worked out from the sidebar menu ("Sales › Invoices › INV-000012"),
 * plus the browser tab title. A record page names itself with usePageCrumb(); otherwise the last
 * step reads "New", "Edit" or "#12" from the address.
 */
export type CrumbLink = { label: string; to: string; section?: string };

const CrumbContext = createContext<{ crumb: string | null; setCrumb: (label: string | null) => void } | null>(null);

export function CrumbProvider({ children }: { children: ReactNode }) {
    const [crumb, setCrumb] = useState<string | null>(null);
    const value = useMemo(() => ({ crumb, setCrumb }), [crumb]);

    return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>;
}

/** The current record's name for the breadcrumb and tab title (e.g. an invoice number). */
export function usePageCrumb(label: string | null | undefined) {
    const ctx = useContext(CrumbContext);
    useEffect(() => {
        ctx?.setCrumb(label ?? null);

        return () => ctx?.setCrumb(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [label]);
}

/** Pages reached from the profile menu rather than the sidebar. */
const EXTRA: CrumbLink[] = [
    { label: 'My Profile', to: '/profile' },
    { label: 'My Timesheets', to: '/timesheets' },
    { label: 'To Do Items', to: '/todos' },
    { label: 'Newsfeed', to: '/newsfeed' },
    { label: 'Tasks Overview', to: '/tasks/overview', section: 'Tasks' },
    { label: 'Mail Lists', to: '/utilities/mail-lists', section: 'Utilities' },
    { label: 'Forms', to: '/estimate-requests/forms', section: 'Estimate Request' },
];

const APP = 'GIC Folks CRM';

/** "/purchase/credit-notes" → "Credit Note" (for "New …"). */
const thing = (to: string) =>
    (to.split('/').pop() ?? '')
        .replace(/ies$/, 'y')
        .replace(/s$/, '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

export function Breadcrumbs({ links, pathname }: { links: CrumbLink[]; pathname: string }) {
    const ctx = useContext(CrumbContext);
    const all = [...EXTRA, ...links];
    // The longest menu address this page sits under.
    const match = all
        .filter((l) => l.to !== '/' && (pathname === l.to || pathname.startsWith(`${l.to}/`)))
        .sort((a, b) => b.to.length - a.to.length)[0];

    const rest = match ? pathname.slice(match.to.length).split('/').filter(Boolean) : [];
    const tail = ctx?.crumb ?? (rest.includes('new') ? `New ${thing(match?.to ?? '')}` : rest[rest.length - 1] === 'edit' ? 'Edit' : rest.length ? `#${rest[0]}` : null);
    const editing = Boolean(ctx?.crumb) && rest[rest.length - 1] === 'edit';

    const title = tail ?? match?.label ?? (pathname === '/' ? 'Dashboard' : null);
    useEffect(() => {
        document.title = title ? `${editing ? `Edit ${title}` : title} · ${APP}` : APP;
    }, [title, editing]);

    if (!match) {
        return null;
    }

    return (
        <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 items-center gap-1 text-[12.5px] font-medium text-slate-400">
            <Link to="/" className="rounded p-0.5 hover:text-brand" aria-label="Dashboard">
                <Home className="h-3.5 w-3.5" />
            </Link>
            {match.section && (
                <>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="shrink-0">{match.section}</span>
                </>
            )}
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            {tail ? (
                <Link to={match.to} className="shrink-0 hover:text-brand">
                    {match.label}
                </Link>
            ) : (
                <span className="truncate text-slate-600" aria-current="page">
                    {match.label}
                </span>
            )}
            {tail && (
                <>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-slate-600" aria-current="page">
                        {editing ? `Edit ${tail}` : tail}
                    </span>
                </>
            )}
        </nav>
    );
}
