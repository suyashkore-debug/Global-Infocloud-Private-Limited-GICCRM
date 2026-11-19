import { useEffect, useState } from 'react';
import { Check, ChevronDown, Workflow } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Menu } from '../components/ui';
import { getLeadWorkspace, LEAD_WORKSPACE_CHANGED, setLeadWorkspace } from '../lib/leadWorkspace';

type Workspace = { id: number; name: string; color: string; is_default: boolean; count: number };

/**
 * Header: the lead workspace to work in (Sales, Post-sales…), beside the search. Shown when the
 * person has more than one; everywhere leads show (lists, dashboards, calendar, reports, search)
 * only that workspace's leads are shown.
 */
export function WorkspaceSwitcher() {
    const { data, reload } = useApi<{ data: Workspace[] }>('/leads/workspaces');
    const [current, setCurrent] = useState(getLeadWorkspace);

    useEffect(() => {
        const follow = (e: Event) => setCurrent((e as CustomEvent<number>).detail);
        window.addEventListener(LEAD_WORKSPACE_CHANGED, follow);

        return () => window.removeEventListener(LEAD_WORKSPACE_CHANGED, follow);
    }, []);

    const list = data?.data ?? [];
    if (list.length < 2) {
        return null;
    }
    const open = list.find((w) => w.id === current) ?? list.find((w) => w.is_default) ?? list[0];

    // The page open reloads with the workspace's data (the layout re-opens it; a record's page
    // goes to its list).
    const pick = (id: number) => id !== open.id && setLeadWorkspace(id);

    return (
        <Menu
            align="left"
            trigger={(toggle) => (
                <button
                    type="button"
                    onClick={() => (reload(), toggle())}
                    title="Lead workspace"
                    className="flex h-10 shrink-0 items-center gap-2 rounded-2xl bg-white/90 pl-2 pr-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-slate-200/80 transition hover:shadow-md hover:ring-brand/30"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl text-white" style={{ background: open.color }}>
                        <Workflow className="h-3.5 w-3.5" />
                    </span>
                    <span className="hidden min-w-0 leading-tight sm:block">
                        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Workspace</span>
                        <span className="block max-w-[9rem] truncate text-[13px] font-bold text-slate-800">{open.name}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
            )}
        >
            {(close) => (
                <div className="w-64 py-1">
                    <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lead workspaces</p>
                    {list.map((w) => (
                        <button
                            key={w.id}
                            type="button"
                            onClick={() => (close(), pick(w.id))}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-slate-50 ${w.id === open.id ? 'bg-brand-50/70' : ''}`}
                        >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: w.color }}>
                                <Workflow className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-semibold text-slate-800">{w.name}</span>
                                <span className="block text-[11.5px] text-slate-500">
                                    {w.count} open lead{w.count === 1 ? '' : 's'}
                                </span>
                            </span>
                            {w.id === open.id && <Check className="h-4 w-4 shrink-0 text-brand" />}
                        </button>
                    ))}
                </div>
            )}
        </Menu>
    );
}
