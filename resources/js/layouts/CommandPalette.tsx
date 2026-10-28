import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CornerDownLeft, FileSignature, FileText, FolderKanban, LifeBuoy, ListChecks, Loader2, Receipt, Search, Target, UserRound, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useTaskModals } from '../components/tasks/TaskModalHost';

export interface PaletteLink {
    label: string;
    to: string;
    icon?: LucideIcon;
    /** Where it sits in the sidebar, e.g. "Sales". */
    section?: string;
}

export interface PaletteAction {
    label: string;
    icon: LucideIcon;
    run: () => void;
}

type Hit = {
    id: number;
    title: string;
    subtitle: string | null;
    url: string | null;
};
type Results = Partial<Record<keyof typeof GROUPS, Hit[]>>;

const GROUPS = {
    projects: { label: 'Projects', icon: FolderKanban },
    tasks: { label: 'Tasks', icon: ListChecks },
    customers: { label: 'Customers', icon: Building2 },
    contacts: { label: 'Contacts', icon: UserRound },
    leads: { label: 'Leads', icon: Target },
    invoices: { label: 'Invoices', icon: Receipt },
    estimates: { label: 'Estimates', icon: FileText },
    proposals: { label: 'Proposals', icon: FileSignature },
    tickets: { label: 'Tickets', icon: LifeBuoy },
    contracts: { label: 'Contracts', icon: FileSignature },
} as const;

type Row = {
    key: string;
    group: string;
    icon: LucideIcon;
    title: string;
    subtitle?: string | null;
    hint?: string;
    run: () => void;
};

/**
 * Ctrl+K quick search: records from across the CRM (what the user may open), the sidebar's pages
 * and the quick-create actions, all reachable from the keyboard.
 */
export default function CommandPalette({ open, onClose, links, actions }: { open: boolean; onClose: () => void; links: PaletteLink[]; actions: PaletteAction[] }) {
    const navigate = useNavigate();
    const { openTask } = useTaskModals();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Results>({});
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setResults({});
            setActive(0);
            // After whatever had focus (e.g. a closing modal) lets go.
            const timers = [0, 60, 150].map((ms) => setTimeout(() => input.current?.focus(), ms));

            return () => timers.forEach(clearTimeout);
        }
    }, [open]);

    // Records: ask the server once typing pauses.
    useEffect(() => {
        const q = query.trim();
        if (!open || q.length < 2) {
            setResults({});
            setLoading(false);
            return;
        }
        setLoading(true);
        let alive = true;
        const timer = setTimeout(() => {
            api.get<{ data: Results }>('/search', { params: { q } })
                .then((r) => alive && setResults(Array.isArray(r.data.data) ? {} : r.data.data))
                .catch(() => alive && setResults({}))
                .finally(() => alive && setLoading(false));
        }, 220);

        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [query, open]);

    const go = (to: string) => (onClose(), navigate(to));

    const rows = useMemo<Row[]>(() => {
        const q = query.trim().toLowerCase();
        const out: Row[] = [];
        const matches = (text: string) => !q || text.toLowerCase().includes(q);

        (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).forEach((g) => {
            results[g]?.forEach((hit) =>
                out.push({
                    key: `${g}-${hit.id}`,
                    group: GROUPS[g].label,
                    icon: GROUPS[g].icon,
                    title: hit.title,
                    subtitle: hit.subtitle,
                    run: () => (g === 'tasks' || !hit.url ? (onClose(), openTask(hit.id)) : go(hit.url)),
                }),
            );
        });
        const pages = links
            .filter((l) => matches(l.label) || (l.section && matches(l.section)))
            .slice(0, q ? 8 : 12)
            .map<Row>((l) => ({ key: `page-${l.to}`, group: 'Go to', icon: l.icon ?? ArrowRight, title: l.label, subtitle: l.section, run: () => go(l.to) }));
        const creates = actions
            .filter((a) => matches(a.label) || (q && matches(`new ${a.label}`)))
            .map<Row>((a) => ({ key: `action-${a.label}`, group: 'Create', icon: a.icon, title: `New ${a.label.toLowerCase()}`, run: () => (onClose(), a.run()) }));
        // While typing, a matching page comes before "New …"; with nothing typed, create actions lead.
        out.push(...(q ? [...pages, ...creates] : [...creates, ...pages]));

        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, query, links, actions]);

    useEffect(() => setActive(0), [rows.length, query]);

    useEffect(() => {
        list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    if (!open) {
        return null;
    }

    function onKey(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(rows.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            rows[active]?.run();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    }

    let lastGroup = '';
    const searching = query.trim().length >= 2;
    const noRecords = searching && !loading && Object.keys(results).length === 0;

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-start justify-center bg-slate-900/40 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-label="Quick search" className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onKeyDown={onKey}>
                <div className="flex items-center gap-3 border-b border-slate-100 px-4">
                    {loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand" /> : <Search className="h-5 w-5 shrink-0 text-slate-400" />}
                    <input
                        ref={input}
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search projects, tasks, customers, invoices… or jump to a page"
                        className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="palette-list"
                        aria-activedescendant={rows[active] ? `palette-${active}` : undefined}
                    />
                    <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 sm:block">Esc</kbd>
                </div>

                <div ref={list} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
                    {noRecords && <p className="px-3 py-3 text-[13px] text-slate-500">No records match “{query.trim()}”.</p>}
                    {rows.map((row, i) => {
                        const heading = row.group !== lastGroup ? row.group : null;
                        lastGroup = row.group;
                        const Icon = row.icon;

                        return (
                            <div key={row.key}>
                                {heading && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 first:pt-1">{heading}</p>}
                                <button
                                    type="button"
                                    id={`palette-${i}`}
                                    data-row={i}
                                    role="option"
                                    aria-selected={i === active}
                                    onMouseMove={() => i !== active && setActive(i)}
                                    onClick={row.run}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === active ? 'bg-brand-50' : ''}`}
                                >
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${i === active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        <Icon className="h-[18px] w-[18px]" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <Highlight text={row.title} query={query.trim()} />
                                        {row.subtitle && <span className="block truncate text-[12px] text-slate-500">{row.subtitle}</span>}
                                    </span>
                                    {i === active && <CornerDownLeft className="h-4 w-4 shrink-0 text-brand" />}
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-[11.5px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd> move
                    </span>
                    <span className="flex items-center gap-1">
                        <Kbd>Enter</Kbd> open
                    </span>
                    <span className="ml-auto hidden sm:block">
                        Open anywhere with <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="rounded border border-slate-200 bg-white px-1 py-px font-sans text-[10.5px] font-semibold text-slate-600 shadow-sm">{children}</kbd>;
}

/** The title with the typed text in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
    const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;

    return (
        <span className="block truncate text-[14px] text-slate-800">
            {at < 0 ? (
                text
            ) : (
                <>
                    {text.slice(0, at)}
                    <mark className="rounded bg-accent-50 px-0.5 font-semibold text-accent">{text.slice(at, at + query.length)}</mark>
                    {text.slice(at + query.length)}
                </>
            )}
        </span>
    );
}
