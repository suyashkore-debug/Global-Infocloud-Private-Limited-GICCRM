import { useEffect, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Check, Clock, Columns3, Filter, Globe, List, Paperclip, Plus, RefreshCw, Save, Search, Settings2, StickyNote, Target, Upload, UserCheck } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, timeAgo, rowNumber } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { useAppOptions } from '../../hooks/useAppOptions';
import { useAuth } from '../../auth/AuthContext';
import { Avatar, Button, EmptyState, ErrorNote, Input, Menu, Pagination, Spinner, StatusBadge, Tag } from '../../components/ui';
import { ColumnFilter, FilterPanel, type FilterRule, type LeadSort } from './LeadFilters';
import { DEFAULT_SORT, useLeadViews, ViewTabs, type LeadView } from './LeadViews';
import { readStorage, writeStorage } from '../../lib/storage';
import { getLeadWorkspace, LEAD_WORKSPACE_CHANGED } from '../../lib/leadWorkspace';
import { useToast } from '../../components/ui/Toast';
import type { Lead, LeadStatus, Paginated } from '../../types';
import LeadModal from './LeadModal';
import LeadBulkActions from './LeadBulkActions';
import { usePermission } from '../../hooks/usePermission';
import { LeadRatingCell } from './LeadRating';
import { celebrate } from '../../lib/celebrate';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import { FollowUpBar, FollowUpChip, type FollowUpFilter } from './LeadFollowUp';

/** Columns the list can also show (Perfex's hidden columns), chosen from "Columns". */
const OPTIONAL_COLUMNS: [string, string][] = [
    ['email', 'Email'],
    ['lead_value', 'Value'],
    ['city', 'City'],
    ['state', 'State'],
    ['country', 'Country'],
    ['zip', 'Zip Code'],
    ['assigned_at', 'Date Assigned'],
    ['next_follow_up_at', 'Next Follow-up'],
    ['customer', 'Converted to customer'],
];

type PipelineTab = { id: number; name: string; color: string; is_default: boolean; count: number };
type LeadList = Paginated<Lead> & { meta: { summary: LeadStatus[]; pipelines?: PipelineTab[]; pipeline_id?: number | null } };

/** How the kanban's cards can be ordered (Perfex's kanban sort). */
const KANBAN_SORTS: [string, string][] = [
    ['dateadded', 'Date Created'],
    ['leadorder', 'Kanban Order'],
    ['lastcontact', 'Last Contact'],
];

/** Perfex Leads: table (default) or kanban by status, with filters and the lead modal. */
export default function LeadsPage() {
    const toast = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();
    const appOptions = useAppOptions();
    // Perfex: admins import leads; other staff when Setup → Leads allows it.
    const canImport = !!user?.is_admin || appOptions?.allow_non_admin_members_to_import_leads === '1';
    const [params, setParams] = useSearchParams();
    const [view, setView] = useState<'kanban' | 'list'>('list');
    const [search, setSearch] = useState('');
    // Perfex: click the status summary to filter by those statuses.
    const [statuses, setStatuses] = useState<number[]>([]);
    // The lead workspace picked in the header (remembered in this browser).
    const [pipelineId, setPipelineId] = useState<number | null>(getLeadWorkspace);
    const [selected, setSelected] = useState<number[]>([]);
    // The open view (built-in or saved): its filter rules and sort, which the panel edits.
    const leadStatuses = useApi<{ data: LeadStatus[] }>('/setup/lead-statuses');
    const wonStatusId = leadStatuses.data?.data.find((s) => s.is_default)?.id ?? null;
    const { views, loaded: viewsLoaded, reload: reloadViews } = useLeadViews(user?.id ?? 0, wonStatusId);
    const [activeView, setActiveView] = useState(() => readStorage('leads_view') ?? 'active');
    const [rules, setRules] = useState<FilterRule[]>([]);
    const [listSort, setListSort] = useState<LeadSort>(DEFAULT_SORT);
    const [ready, setReady] = useState(false);
    const [pendingView, setPendingView] = useState<string | null>(null);
    const [saveSignal, setSaveSignal] = useState(0);
    const [panelOpen, setPanelOpen] = useState(() => readStorage('leads_filter_panel') === '1');
    // Kanban "Sort by" (starts from Setup → Leads) and "Load more" per column.
    const [kanbanSort, setKanbanSort] = useState<{ by: string; dir: 'asc' | 'desc' } | null>(null);
    const [more, setMore] = useState<Record<number, number>>({});
    const [columns, setColumns] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('leads_columns') ?? '[]');
        } catch {
            return [];
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem('leads_columns', JSON.stringify(columns));
        } catch {
            // Storage blocked: the choice lasts for this page only.
        }
    }, [columns]);
    const sort = kanbanSort ?? { by: appOptions?.default_leads_kanban_sort || 'leadorder', dir: appOptions?.default_leads_kanban_sort_type === 'desc' ? ('desc' as const) : ('asc' as const) };
    const show = (key: string) => columns.includes(key);
    const [bulkOpen, setBulkOpen] = useState(false);
    const canDelete = usePermission('leads.delete');
    const sources = useApi<{ data: { id: number; name: string }[] }>('/setup/lead-sources');
    const [page, setPage] = useState(1);
    const [newOpen, setNewOpen] = useState<{ statusId?: number } | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [overColumn, setOverColumn] = useState<number | null>(null);
    const leadId = Number(params.get('lead')) || null;

    function selectView(v: LeadView) {
        setActiveView(v.id);
        writeStorage('leads_view', v.id);
        setRules(v.state.rules);
        setListSort(v.state.sort);
        setPage(1);
        setSelected([]);
    }
    // First the views (and the won status, for "All Active Leads"), then the leads of the open view.
    useEffect(() => {
        if (!ready && viewsLoaded && leadStatuses.data) {
            selectView(views.find((v) => v.id === activeView) ?? views.find((v) => v.id === 'active')!);
            setReady(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewsLoaded, leadStatuses.data]);
    // A view just saved or deleted: open it (or All Leads) once the list of views has reloaded.
    useEffect(() => {
        const v = pendingView && views.find((x) => x.id === pendingView);
        if (v) {
            selectView(v);
            setPendingView(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [views, pendingView]);
    const current = { rules, sort: listSort };
    const openView = views.find((v) => v.id === activeView);
    const dirty = !!openView && JSON.stringify(openView.state) !== JSON.stringify(current);
    const applyRules = (r: FilterRule[]) => (setRules(r), setPage(1), setSelected([]));
    // Follow-ups bar: one follow-up rule at a time, soonest first.
    const followUpFilter = (rules.find((r) => r.field === 'next_follow_up_at')?.op ?? null) as FollowUpFilter | null;
    const pickFollowUp = (f: FollowUpFilter | null) => {
        applyRules([...rules.filter((r) => r.field !== 'next_follow_up_at'), ...(f ? [{ field: 'next_follow_up_at', op: f } as FilterRule] : [])]);
        if (f) {
            setListSort({ sort: 'next_follow_up_at', dir: 'asc' });
        }
    };
    const togglePanel = () => setPanelOpen((o) => (writeStorage('leads_filter_panel', o ? '0' : '1'), !o));
    const toggleSort = (key: string) => (setListSort((s) => ({ sort: key, dir: s.sort === key && s.dir === 'desc' ? 'asc' : 'desc' })), setPage(1));

    const { data, loading, error, reload, setData } = useApi<LeadList>(ready ? '/leads' : null, {
        search,
        pipeline_id: pipelineId ?? undefined,
        kanban: view === 'kanban' ? 1 : undefined,
        page: view === 'list' ? page : undefined,
        rules: rules.length ? JSON.stringify(rules) : undefined,
        ...(view === 'list' ? { sort: listSort.sort, dir: listSort.dir } : {}),
        ...(view === 'kanban' ? { kanban_sort: sort.by, kanban_dir: sort.dir, more } : {}),
        ...(view === 'list' && statuses.length ? { status: statuses } : {}),
    });
    // The follow-up counts are fetched again whenever the list is.
    const [followUpKey, setFollowUpKey] = useState(0);
    useEffect(() => setFollowUpKey((k) => k + 1), [data]);
    const filterCtx = { statuses: data?.meta.summary ?? leadStatuses.data?.data ?? [], sources: sources.data?.data ?? [] };
    const pipelines = data?.meta.pipelines ?? [];
    const pipeline = pipelines.find((p) => p.id === data?.meta.pipeline_id) ?? null;
    useEffect(() => {
        const follow = (e: Event) => {
            setPipelineId((e as CustomEvent<number>).detail);
            setStatuses([]);
            setMore({});
            setPage(1);
            setSelected([]);
        };
        window.addEventListener(LEAD_WORKSPACE_CHANGED, follow);

        return () => window.removeEventListener(LEAD_WORKSPACE_CHANGED, follow);
    }, []);
    // New leads start in the open pipeline (its first status) unless it is the default one.
    const newLeadStatus = pipeline && !pipeline.is_default ? data?.meta.summary[0]?.id : undefined;
    const total = data ? (view === 'list' ? data.meta.total : data.meta.summary.reduce((a, s) => a + (s.count ?? 0), 0)) : null;
    // A column header: click the name to sort (server side), the funnel to filter by the column.
    const head = (label: string, opts: { sortKey?: string; field?: string; className?: string } = {}) => (
        <th className={opts.className}>
            <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                {opts.sortKey ? (
                    <button type="button" onClick={() => toggleSort(opts.sortKey!)} className="inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-brand" title="Sort by this column">
                        {label}
                        {listSort.sort === opts.sortKey && (listSort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                ) : (
                    label
                )}
                {opts.field && <ColumnFilter field={opts.field} rules={rules} onRules={applyRules} ctx={filterCtx} />}
            </span>
        </th>
    );
    const toggleStatus = (id: number) => (setStatuses((list) => (list.includes(id) ? list.filter((s) => s !== id) : [...list, id])), setPage(1), setView('list'));
    const pageIds = data?.data.map((l) => l.id) ?? [];
    const allTicked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
    const cfCols = useCustomFieldColumns('leads', (data?.data ?? []).map((r) => r.id));

    const openLead = (id: number | null) =>
        setParams((current) => {
            const next = new URLSearchParams(current);
            if (id) {
                next.set('lead', String(id));
            } else {
                next.delete('lead');
            }
            return next;
        });

    const replaceLead = (updated: Lead) => data && setData({ ...data, data: data.data.map((l) => (l.id === updated.id ? updated : l)) });

    async function drop(e: DragEvent, statusId: number) {
        e.preventDefault();
        if (!dragging || !data) {
            return;
        }
        const moved = data.data.find((l) => l.id === dragging);
        const column = data.data.filter((l) => l.status?.id === statusId && l.id !== dragging);
        if (moved) {
            const status = data.meta.summary.find((s) => s.id === statusId);
            // Dropped into the won (Customer) column.
            if (status?.is_default && !moved.status?.is_default) {
                celebrate();
            }
            setData({ ...data, data: data.data.map((l) => (l.id === dragging ? { ...l, status: status ?? l.status } : l)) });
        }
        setDragging(null);
        setOverColumn(null);
        try {
            await api.post('/leads/move', { lead_status_id: statusId, order: [...column.map((l) => l.id), dragging] });
            reload();
        } catch (err) {
            toast(errorMessage(err), 'error');
            reload();
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h4 className="page-title">Leads</h4>
                    {data && (
                        <p className="mt-1 text-[13px] text-slate-500">
                            <b className="text-slate-700">{data.meta.summary.reduce((a, s) => a + (s.count ?? 0), 0)}</b> leads{pipelines.length > 1 && pipeline ? <> in the <b className="text-slate-700">{pipeline.name}</b> workspace</> : ' in the pipeline'} · worth{' '}
                            <b className="text-slate-700">{money(data.meta.summary.reduce((a, s) => a + Number(s.value ?? 0), 0))}</b>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Show as">
                        {(
                            [
                                ['kanban', 'Kanban', Columns3],
                                ['list', 'List', List],
                            ] as const
                        ).map(([id, label, Icon]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setView(id)}
                                aria-pressed={view === id}
                                title={label}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${view === id ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>
                    <Button variant="secondary" onClick={() => navigate('/leads/dashboard')}>
                        <BarChart3 className="h-4 w-4" /> Dashboard
                    </Button>
                    {canImport && (
                        <Button variant="secondary" onClick={() => navigate('/leads/import')}>
                            <Upload className="h-4 w-4" /> Import
                        </Button>
                    )}
                    {user?.is_admin && (
                        <Button variant="secondary" onClick={() => navigate('/leads/forms')}>
                            <Globe className="h-4 w-4" /> Web to Lead
                        </Button>
                    )}
                    <Button onClick={() => setNewOpen({ statusId: newLeadStatus })}>
                        <Plus className="h-4 w-4" /> New Lead
                    </Button>
                </div>
            </div>

            {/* One toolbar: the views, then search, filters, follow-ups and the view's options. */}
            <div className="rounded-2xl bg-white px-4 pt-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-slate-200/70">
            <ViewTabs
                views={views}
                active={activeView}
                current={current}
                dirty={dirty}
                saveSignal={saveSignal}
                onSelect={selectView}
                onChanged={async (id) => {
                    // Open the view only once the list of views has the saved version.
                    await reloadViews();
                    setPendingView(id ?? activeView);
                }}
            />

            <div className="-mx-4 flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
                <Button variant="secondary" onClick={togglePanel} className={rules.length ? '!border-brand !text-brand' : ''}>
                    <Filter className={`h-4 w-4 ${rules.length ? 'text-accent' : ''}`} />
                    {panelOpen ? 'Hide filters' : 'Filters'}
                    {rules.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{rules.length}</span>}
                </Button>
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search leads..." className="pl-9" />
                </div>
                {total !== null && (
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-600">
                        {total} lead{total === 1 ? '' : 's'}
                        <button type="button" onClick={reload} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand" title="Refresh">
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </span>
                )}
                <span className="mx-1 hidden h-6 w-px bg-slate-200 xl:block" />
                <FollowUpBar active={followUpFilter} onPick={pickFollowUp} refreshKey={followUpKey} />
                <span className="ml-auto" />
                {view === 'kanban' && (
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle} title="Order of the cards in each column">
                                <ArrowUpDown className="h-4 w-4" /> {KANBAN_SORTS.find(([by]) => by === sort.by)?.[1] ?? 'Sort'}
                                {sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-slate-400" /> : <ArrowDown className="h-3.5 w-3.5 text-slate-400" />}
                            </Button>
                        )}
                    >
                        {(close) => (
                            <div className="w-56">
                                <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Sort cards by</p>
                                {KANBAN_SORTS.map(([by, label]) => {
                                    const on = sort.by === by;
                                    return (
                                        <button
                                            key={by}
                                            type="button"
                                            onClick={() => (setKanbanSort({ by, dir: on && sort.dir === 'asc' ? 'desc' : on ? 'asc' : sort.dir }), close())}
                                            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13px] hover:bg-brand-50 ${on ? 'font-semibold text-brand' : 'text-slate-700'}`}
                                        >
                                            <span className="flex-1">{label}</span>
                                            {on && (sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Menu>
                )}
                {view === 'list' && (
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                <Settings2 className="h-4 w-4" /> Columns
                                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-bold text-slate-600">{columns.length}</span>
                            </Button>
                        )}
                    >
                        {() => (
                            <div className="w-56">
                                <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">More columns</p>
                                {OPTIONAL_COLUMNS.map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]))}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-brand-50"
                                    >
                                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${show(key) ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>{show(key) && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Menu>
                )}
                <Button variant="secondary" onClick={() => setSaveSignal((n) => n + 1)} title={openView?.saved?.can_manage ? 'Save changes to this view' : 'Save as a new view'} className={dirty ? '!border-accent !text-accent' : ''}>
                    <Save className="h-4 w-4" />
                </Button>
            </div>
            </div>

            {/* The statuses as filters (list only: the kanban shows them as its columns). */}
            {data && view === 'list' && (
                <div className="flex flex-wrap items-center gap-2">
                    {data.meta.summary.map((s) => {
                        const on = statuses.includes(s.id);
                        return (
                            <button
                                key={s.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleStatus(s.id)}
                                title={on ? 'Click to stop filtering by this status' : 'Show only leads with this status'}
                                className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-[12.5px] font-medium shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition ${on ? 'text-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                style={on ? { borderColor: s.color, backgroundColor: `${s.color}1a`, boxShadow: `0 0 0 2px ${s.color}33` } : undefined}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                                <span className="min-w-[1.5rem] rounded-full bg-slate-100 px-1.5 text-center text-[11.5px] font-bold text-slate-700">{s.count}</span>
                            </button>
                        );
                    })}
                    {statuses.length > 0 && (
                        <button type="button" onClick={() => (setStatuses([]), setPage(1))} className="rounded-full px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                            Clear status filter
                        </button>
                    )}
                </div>
            )}

            <div className={panelOpen ? 'grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]' : ''}>
            {panelOpen && <FilterPanel rules={rules} onRules={applyRules} sort={listSort} onSort={(s) => (setListSort(s), setPage(1))} ctx={filterCtx} onClose={togglePanel} />}
            <div className="min-w-0 space-y-4">
            <ErrorNote message={error} />
            {(loading || !ready) && !data ? (
                <Spinner />
            ) : !data ? null : view === 'kanban' ? (
                <div className="space-y-3">
                <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                    <div className="flex min-w-max gap-4">
                        {data.meta.summary.map((status) => {
                            // Already in the Setup → Leads kanban order, at most "Limit leads kanban rows per status".
                            const column = data.data.filter((l) => l.status?.id === status.id);

                            return (
                                <div
                                    key={status.id}
                                    onDragOver={(e) => (e.preventDefault(), overColumn !== status.id && setOverColumn(status.id))}
                                    onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOverColumn(null)}
                                    onDrop={(e) => drop(e, status.id)}
                                    className={`flex w-[290px] flex-col rounded-2xl ring-1 transition ${overColumn === status.id ? 'ring-2 ring-brand/40' : 'ring-slate-200/70'}`}
                                    style={{ backgroundColor: overColumn === status.id ? `${status.color}1f` : `${status.color}0d` }}
                                >
                                    <div className="sticky top-0 z-[1] rounded-t-2xl border-b border-slate-200/70 bg-white/95 px-3.5 pb-2.5 pt-3 backdrop-blur">
                                        <span className="absolute inset-x-3 top-0 h-[3px] rounded-b-full" style={{ backgroundColor: status.color }} />
                                        <div className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-4" style={{ backgroundColor: status.color, ['--tw-ring-color' as string]: `${status.color}26` }} />
                                            <span className="truncate text-[13.5px] font-bold text-slate-800">{status.name}</span>
                                            <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ backgroundColor: `${status.color}1a`, color: status.color }}>
                                                {status.count}
                                            </span>
                                            <button type="button" onClick={() => setNewOpen({ statusId: status.id })} title={`New lead in ${status.name}`} className="ml-auto rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-brand">
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <p className="mt-0.5 pl-[18px] text-[12px] font-medium text-slate-500">{money(status.value ?? 0)}</p>
                                    </div>
                                    <div className="flex min-h-[9rem] flex-1 flex-col gap-2 p-2">
                                        {column.length === 0 && (
                                            <div className={`flex flex-1 items-center justify-center rounded-xl border-2 border-dashed px-3 py-6 text-center text-[12px] font-medium transition ${overColumn === status.id ? 'border-brand/40 text-brand' : 'border-slate-200 text-slate-400'}`}>
                                                {overColumn === status.id ? 'Drop here' : 'No leads · drag one here'}
                                            </div>
                                        )}
                                        {column.map((lead) => (
                                            <div
                                                key={lead.id}
                                                draggable
                                                onDragStart={() => setDragging(lead.id)}
                                                onDragEnd={() => (setDragging(null), setOverColumn(null))}
                                                onClick={() => openLead(lead.id)}
                                                className={`group cursor-pointer rounded-xl border bg-white p-3 text-[13px] transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${lead.rating === 5 ? 'lead-hot' : 'border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-brand/30'} ${dragging === lead.id ? 'opacity-50' : ''}`}
                                            >
                                                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400" title={[lead.email, lead.phone, [lead.city, lead.state, lead.country].filter(Boolean).join(', ')].filter(Boolean).join('\n') || undefined}>
                                                    #{lead.id}
                                                    {lead.customer && (
                                                        <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-px text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                                                            <UserCheck className="h-3 w-3" /> Customer
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="flex items-start justify-between gap-2 font-semibold leading-snug text-slate-800 group-hover:text-brand">
                                                    <span>{lead.name}</span>
                                                    {lead.rating === 5 && <HotBadge />}
                                                </p>
                                                {lead.company && <p className="truncate text-[12.5px] text-slate-500">{lead.company}</p>}
                                                <div className="mt-1.5">
                                                    <LeadRatingCell lead={lead} onChanged={replaceLead} />
                                                </div>
                                                {(lead.tags?.length ?? 0) > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {lead.tags?.map((t) => (
                                                            <Tag key={t}>{t}</Tag>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Wraps onto a second line on narrow cards instead of squeezing (source, value, follow-up, age, owner). */}
                                                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2.5">
                                                    {lead.source?.name && <span className="max-w-[9rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600" title={lead.source.name}>{lead.source.name}</span>}
                                                    {lead.lead_value && <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-slate-700">{money(lead.lead_value)}</span>}
                                                    {(lead.notes_count ?? 0) > 0 && (
                                                        <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400" title={`${lead.notes_count} notes`}>
                                                            <StickyNote className="h-3 w-3" />
                                                            {lead.notes_count}
                                                        </span>
                                                    )}
                                                    {(lead.attachments_count ?? 0) > 0 && (
                                                        <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400" title={`${lead.attachments_count} files`}>
                                                            <Paperclip className="h-3 w-3" />
                                                            {lead.attachments_count}
                                                        </span>
                                                    )}
                                                    {lead.next_follow_up_at && <FollowUpChip at={lead.next_follow_up_at} compact />}
                                                    <span className="ml-auto inline-flex shrink-0 items-center gap-2">
                                                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-400" title={lead.last_contact_at ? `Last contact ${timeAgo(lead.last_contact_at)}` : undefined}>
                                                            <Clock className="h-3 w-3" />
                                                            {timeAgo(lead.created_at)}
                                                        </span>
                                                        {lead.assigned && <Avatar id={lead.assigned.id} name={lead.assigned.full_name} size="sm" />}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {(status.count ?? 0) > column.length && (
                                            <button
                                                type="button"
                                                onClick={() => setMore((m) => ({ ...m, [status.id]: (m[status.id] ?? 0) + (Number(appOptions?.leads_kanban_limit) || 50) }))}
                                                className="rounded-lg bg-white/80 px-2 py-1.5 text-center text-[12px] font-semibold text-brand ring-1 ring-slate-200 transition hover:bg-white hover:ring-brand/30"
                                            >
                                                Load more · {(status.count ?? 0) - column.length} more
                                            </button>
                                        )}

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                </div>
            ) : data.data.length === 0 ? (
                <EmptyState icon={Target} title="No leads found" text="Leads you add, or that come in from your forms and calls, show up here. Try another filter, or add your first lead." action={<Button onClick={() => setNewOpen({})}><Plus className="h-4 w-4" /> Add a lead</Button>} />
            ) : (
                <div className="panel_s overflow-hidden">
                    {selected.length > 0 && (
                        <div className="fade-in flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50 px-5 py-2.5 text-[13px]">
                            <span className="font-semibold text-brand">
                                {selected.length} lead{selected.length === 1 ? '' : 's'} selected
                            </span>
                            <Button size="sm" onClick={() => setBulkOpen(true)}>
                                Bulk Actions
                            </Button>
                            <button type="button" onClick={() => setSelected([])} className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-800">
                                Clear selection
                            </button>
                        </div>
                    )}
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex" data-nosort>
                            <thead>
                                <tr>
                                    <th className="w-10">
                                        <input type="checkbox" aria-label="Select all on this page" checked={allTicked} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...pageIds])] : selected.filter((id) => !pageIds.includes(id)))} />
                                    </th>
                                    <th>#</th>
                                    {head('Name', { sortKey: 'name', field: 'name' })}
                                    {head('Company', { sortKey: 'company', field: 'company' })}
                                    {show('email') && head('Email', { field: 'email' })}
                                    {head('Phone', { field: 'phone' })}
                                    {show('lead_value') && head('Value', { sortKey: 'lead_value', field: 'lead_value', className: 'text-right' })}
                                    <th>Tags</th>
                                    {head('Assigned', { field: 'assigned_id' })}
                                    {head('Status', { field: 'lead_status_id' })}
                                    {head('Source', { field: 'lead_source_id' })}
                                    <th>Rating</th>
                                    {head('Last Contact', { sortKey: 'last_contact_at', field: 'last_contact_at' })}
                                    {head('Created', { sortKey: 'created_at', field: 'created_at' })}
                                    {show('city') && head('City', { field: 'city' })}
                                    {show('state') && head('State', { field: 'state' })}
                                    {show('country') && head('Country', { field: 'country' })}
                                    {show('zip') && head('Zip Code', { field: 'zip' })}
                                    {show('assigned_at') && head('Date Assigned', { sortKey: 'assigned_at', field: 'assigned_at' })}
                                    {show('next_follow_up_at') && head('Next Follow-up', { sortKey: 'next_follow_up_at', field: 'next_follow_up_at' })}
                                    {show('customer') && <th>Converted to customer</th>}
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((lead, n) => (
                                    <tr key={lead.id} className={`cursor-pointer ${lead.rating === 5 ? 'lead-hot-row' : ''}`} onClick={() => openLead(lead.id)}>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" aria-label={`Select ${lead.name}`} checked={selected.includes(lead.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, lead.id] : selected.filter((id) => id !== lead.id))} />
                                        </td>
                                        <td>{rowNumber(data.meta, n)}</td>
                                        <td className="font-semibold text-brand">
                                            <span className="inline-flex items-center gap-2">
                                                {lead.name}
                                                {lead.rating === 5 && <HotBadge />}
                                            </span>
                                        </td>
                                        <td>{lead.company}</td>
                                        {show('email') && <td>{lead.email}</td>}
                                        <td>{lead.phone}</td>
                                        {show('lead_value') && <td className="text-right">{lead.lead_value ? money(lead.lead_value) : ''}</td>}
                                        <td>
                                            <div className="flex flex-wrap gap-1">{lead.tags?.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                                        </td>
                                        <td>{lead.assigned?.full_name}</td>
                                        <td>{lead.status && <StatusBadge option={{ id: lead.status.id, name: lead.status.name, color: lead.status.color }} />}</td>
                                        <td>{lead.source?.name}</td>
                                        <td className="whitespace-nowrap" data-sort-value={lead.rating}>
                                            <LeadRatingCell lead={lead} onChanged={replaceLead} />
                                        </td>
                                        <td className="whitespace-nowrap">{lead.last_contact_at ? timeAgo(lead.last_contact_at) : ''}</td>
                                        <td className="whitespace-nowrap">{formatDate(lead.created_at)}</td>
                                        {show('city') && <td>{lead.city}</td>}
                                        {show('state') && <td>{lead.state}</td>}
                                        {show('country') && <td>{lead.country}</td>}
                                        {show('zip') && <td>{lead.zip}</td>}
                                        {show('assigned_at') && <td className="whitespace-nowrap">{lead.assigned_at ? formatDate(lead.assigned_at) : ''}</td>}
                                        {show('next_follow_up_at') && (
                                            <td className="whitespace-nowrap" title={lead.follow_up_note ?? undefined}>
                                                <FollowUpChip at={lead.next_follow_up_at} />
                                            </td>
                                        )}
                                        {show('customer') && (
                                            <td onClick={(e) => e.stopPropagation()}>
                                                {lead.customer ? (
                                                    <a href={`/customers/${lead.customer.id}`} onClick={(e) => (e.preventDefault(), navigate(`/customers/${lead.customer!.id}`))}>
                                                        {lead.customer.name}
                                                    </a>
                                                ) : (
                                                    ''
                                                )}
                                            </td>
                                        )}
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, lead.id)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}

            </div>
            </div>

            {bulkOpen && data && (
                <LeadBulkActions
                    ids={selected}
                    statuses={data.meta.summary}
                    sources={sources.data?.data ?? []}
                    canDelete={canDelete}
                    onClose={() => setBulkOpen(false)}
                    onDone={() => (setBulkOpen(false), setSelected([]), reload())}
                />
            )}
            <LeadModal open={leadId !== null} leadId={leadId} onClose={() => openLead(null)} onChanged={reload} />
            <LeadModal
                open={newOpen !== null}
                leadId={null}
                defaultStatusId={newOpen?.statusId}
                onClose={() => setNewOpen(null)}
                onChanged={() => {
                    setNewOpen(null);
                    reload();
                }}
            />
        </div>
    );
}

/** 5-star leads: a small flame badge. */
function HotBadge() {
    return (
        <span title="Hot lead: 5 of 5 qualification criteria met" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[linear-gradient(135deg,#ff8a3d,#fa6010)] px-1.5 py-[1px] text-[10.5px] font-bold uppercase tracking-wide text-white shadow-[0_4px_10px_-4px_rgba(250,96,16,0.8)]">
            🔥 Hot
        </span>
    );
}
