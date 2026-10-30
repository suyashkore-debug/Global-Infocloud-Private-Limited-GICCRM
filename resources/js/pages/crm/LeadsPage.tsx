import { useEffect, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Clock, Columns3, Globe, List, Paperclip, Plus, Search, Settings2, StickyNote, Target, Upload, UserCheck } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { useAppOptions } from '../../hooks/useAppOptions';
import { useAuth } from '../../auth/AuthContext';
import { Avatar, Button, EmptyState, ErrorNote, Input, Menu, Pagination, Select, Spinner, StatusBadge, Tag } from '../../components/ui';
import LeadFilters, { type FilterRule } from './LeadFilters';
import { useToast } from '../../components/ui/Toast';
import type { Lead, LeadStatus, Paginated } from '../../types';
import LeadModal from './LeadModal';
import LeadBulkActions from './LeadBulkActions';
import { usePermission } from '../../hooks/usePermission';
import { LeadRatingCell } from './LeadRating';
import { celebrate } from '../../lib/celebrate';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

/** Columns the list can also show (Perfex's hidden columns), chosen from "Columns". */
const OPTIONAL_COLUMNS: [string, string][] = [
    ['city', 'City'],
    ['state', 'State'],
    ['country', 'Country'],
    ['zip', 'Zip Code'],
    ['assigned_at', 'Date Assigned'],
    ['customer', 'Converted to customer'],
];

type LeadList = Paginated<Lead> & { meta: { summary: LeadStatus[] } };

/** Perfex Leads: table (default) or kanban by status, with filters and the lead modal. */
export default function LeadsPage() {
    const toast = useToast();
    const staff = useStaff();
    const navigate = useNavigate();
    const { user } = useAuth();
    const appOptions = useAppOptions();
    // Perfex: admins import leads; other staff when Setup → Leads allows it.
    const canImport = !!user?.is_admin || appOptions?.allow_non_admin_members_to_import_leads === '1';
    const [params, setParams] = useSearchParams();
    const [view, setView] = useState<'kanban' | 'list'>('list');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('');
    const [assigned, setAssigned] = useState('');
    // Perfex: click the status summary to filter by those statuses; filter by source.
    const [statuses, setStatuses] = useState<number[]>([]);
    const [source, setSource] = useState('');
    const [selected, setSelected] = useState<number[]>([]);
    const [rules, setRules] = useState<FilterRule[]>([]);
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

    const { data, loading, error, reload, setData } = useApi<LeadList>('/leads', {
        search,
        kanban: view === 'kanban' ? 1 : undefined,
        page: view === 'list' ? page : undefined,
        assigned_id: assigned || undefined,
        source_id: source || undefined,
        rules: rules.length ? JSON.stringify(rules) : undefined,
        ...(view === 'kanban' ? { kanban_sort: sort.by, kanban_dir: sort.dir, more } : {}),
        ...(view === 'list' && statuses.length ? { status: statuses } : {}),
        ...(filter ? { [filter]: 1 } : {}),
    });
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
            <h4 className="page-title">Leads</h4>
            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setNewOpen({})}>
                    <Plus className="h-4 w-4" /> New Lead
                </Button>
                {canImport && (
                    <Button variant="secondary" onClick={() => navigate('/leads/import')}>
                        <Upload className="h-4 w-4" /> Import Leads
                    </Button>
                )}
                {user?.is_admin && (
                    <Button variant="secondary" onClick={() => navigate('/leads/forms')}>
                        <Globe className="h-4 w-4" /> Web to Lead
                    </Button>
                )}
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                    <button type="button" onClick={() => setView('kanban')} className={`rounded-md px-2.5 py-1.5 ${view === 'kanban' ? 'bg-brand text-white' : 'text-slate-500 hover:text-slate-800'}`} title="Kanban">
                        <Columns3 className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setView('list')} className={`rounded-md px-2.5 py-1.5 ${view === 'list' ? 'bg-brand text-white' : 'text-slate-500 hover:text-slate-800'}`} title="List">
                        <List className="h-4 w-4" />
                    </button>
                </div>
                <Select value={filter} onChange={(e) => (setFilter(e.target.value), setPage(1))} className="w-auto">
                    <option value="">All leads</option>
                    <option value="my_leads">My leads</option>
                    <option value="not_assigned">Not assigned</option>
                    <option value="public">Public</option>
                    <option value="contacted_today">Contacted today</option>
                    <option value="created_today">Created today</option>
                    <option value="lost">Lost</option>
                    <option value="junk">Junk</option>
                </Select>
                <Select value={assigned} onChange={(e) => (setAssigned(e.target.value), setPage(1))} className="w-auto">
                    <option value="">Any staff</option>
                    {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.full_name}
                        </option>
                    ))}
                </Select>
                <Select value={source} onChange={(e) => (setSource(e.target.value), setPage(1))} className="w-auto">
                    <option value="">Any source</option>
                    {(sources.data?.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </Select>
                <span className="ml-auto" />
                <LeadFilters rules={rules} onApply={(r) => (setRules(r), setPage(1))} statuses={data?.meta.summary ?? []} sources={sources.data?.data ?? []} />
                <SavedFilters
                    identifier="leads"
                    current={{ search, filter, assigned, source, statuses, rules }}
                    onApply={(f) => {
                        setSearch(savedText(f.search));
                        setFilter(savedText(f.filter));
                        setAssigned(savedText(f.assigned));
                        setSource(savedText(f.source));
                        setStatuses(savedIds(f.statuses));
                        setRules(Array.isArray(f.rules) ? (f.rules as FilterRule[]) : []);
                        setPage(1);
                    }}
                />
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search leads..." className="pl-9" />
                </div>
            </div>

            {data && (
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

            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data ? null : view === 'kanban' ? (
                <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="font-semibold text-slate-500">Sort by:</span>
                    {[
                        ['dateadded', 'Date Created'],
                        ['leadorder', 'Kanban Order'],
                        ['lastcontact', 'Last Contact'],
                    ].map(([by, label]) => {
                        const on = sort.by === by;
                        return (
                            <button
                                key={by}
                                type="button"
                                onClick={() => setKanbanSort({ by, dir: on && sort.dir === 'asc' ? 'desc' : on ? 'asc' : sort.dir })}
                                title={on ? 'Click to reverse the order' : undefined}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${on ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand'}`}
                            >
                                {label}
                                {on && (sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                            </button>
                        );
                    })}
                </div>
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
                                    className={`flex w-[280px] flex-col rounded-xl bg-slate-100/80 ring-1 transition ${overColumn === status.id ? 'bg-brand-50 ring-2 ring-brand/30' : 'ring-slate-200/70'}`}
                                >
                                    <div className="relative overflow-hidden rounded-t-xl border-b border-slate-200/80 bg-white px-3.5 pb-2.5 pt-3">
                                        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: status.color }} />
                                        <div className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                                            <span className="truncate text-[13.5px] font-semibold text-slate-800">{status.name}</span>
                                            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-bold text-slate-600">{status.count}</span>
                                        </div>
                                        <p className="mt-0.5 pl-[18px] text-[12px] text-slate-500">{money(status.value ?? 0)}</p>
                                    </div>
                                    <div className="flex min-h-[8rem] flex-col gap-2 p-2">
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
                                                <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                                                    {lead.source?.name && <span className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{lead.source.name}</span>}
                                                    {lead.lead_value && <span className="text-[12px] font-semibold text-slate-700">{money(lead.lead_value)}</span>}
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
                                                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-400" title={lead.last_contact_at ? `Last contact ${timeAgo(lead.last_contact_at)}` : undefined}>
                                                        <Clock className="h-3 w-3" />
                                                        {timeAgo(lead.created_at)}
                                                    </span>
                                                    {lead.assigned && <Avatar id={lead.assigned.id} name={lead.assigned.full_name} size="sm" />}
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
                                        <button type="button" onClick={() => setNewOpen({ statusId: status.id })} className="flex items-center gap-1 rounded-lg border border-dashed border-transparent px-2 py-1.5 text-left text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-brand">
                                            <Plus className="h-3.5 w-3.5" />
                                            New lead
                                        </button>
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
                    <div className="flex justify-end border-b border-slate-100 px-4 py-2">
                        <Menu
                            trigger={(toggle) => (
                                <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                                    <Settings2 className="h-4 w-4" /> Columns
                                </button>
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
                    </div>
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
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th className="w-10">
                                        <input type="checkbox" aria-label="Select all on this page" checked={allTicked} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...pageIds])] : selected.filter((id) => !pageIds.includes(id)))} />
                                    </th>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Company</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th className="text-right">Value</th>
                                    <th>Tags</th>
                                    <th>Assigned</th>
                                    <th>Status</th>
                                    <th>Source</th>
                                    <th>Rating</th>
                                    <th>Last Contact</th>
                                    <th>Created</th>
                                    {show('city') && <th>City</th>}
                                    {show('state') && <th>State</th>}
                                    {show('country') && <th>Country</th>}
                                    {show('zip') && <th>Zip Code</th>}
                                    {show('assigned_at') && <th>Date Assigned</th>}
                                    {show('customer') && <th>Converted to customer</th>}
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((lead) => (
                                    <tr key={lead.id} className={`cursor-pointer ${lead.rating === 5 ? 'lead-hot-row' : ''}`} onClick={() => openLead(lead.id)}>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" aria-label={`Select ${lead.name}`} checked={selected.includes(lead.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, lead.id] : selected.filter((id) => id !== lead.id))} />
                                        </td>
                                        <td>{lead.id}</td>
                                        <td className="font-semibold text-brand">
                                            <span className="inline-flex items-center gap-2">
                                                {lead.name}
                                                {lead.rating === 5 && <HotBadge />}
                                            </span>
                                        </td>
                                        <td>{lead.company}</td>
                                        <td>{lead.email}</td>
                                        <td>{lead.phone}</td>
                                        <td className="text-right">{lead.lead_value ? money(lead.lead_value) : ''}</td>
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
