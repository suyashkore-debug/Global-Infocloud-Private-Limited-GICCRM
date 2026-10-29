import { useState, type CSSProperties, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, Columns3, List, Plus, Search } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { ESTIMATE_STATUSES, money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Input, Pagination, Spinner, StatusBadge, Tag } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Estimate, Paginated } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type EstimateList = Paginated<Estimate> & { meta: { status_counts: Record<string, { count: number; amount: number }> } };

export function EstimatesTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const toast = useToast();
    const canCreate = usePermission('estimates.create');
    const [view, setView] = useState<'list' | 'pipeline'>('list');
    const [statuses, setStatuses] = useState<number[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [dragging, setDragging] = useState<number | null>(null);
    const { data, loading, error, reload } = useApi<EstimateList>('/estimates', {
        search,
        page: view === 'list' ? page : 1,
        per_page: view === 'pipeline' ? 500 : 25,
        sort: view === 'pipeline' ? 'pipeline' : undefined,
        customer_id: customerId,
        project_id: projectId,
        ...(statuses.length && view === 'list' ? { status: statuses } : {}),
    });
    const cfCols = useCustomFieldColumns('estimate', (data?.data ?? []).map((r) => r.id));

    async function drop(e: DragEvent, status: number) {
        e.preventDefault();
        if (!dragging || !data) {
            return;
        }
        const column = data.data.filter((est) => est.status === status && est.id !== dragging).map((est) => est.id);
        try {
            await api.post('/estimates/move', { status, order: [...column, dragging] });
            reload();
        } catch (err) {
            toast(errorMessage(err), 'error');
        }
        setDragging(null);
    }

    return (
        <div className="space-y-4">
            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {ESTIMATE_STATUSES.map((s) => (
                        <div key={s.id} className="rounded-lg border border-gray-300/60 bg-white px-4 py-3 shadow-sm">
                            <p className="text-lg font-semibold" style={{ color: s.color }}>
                                {data.meta.status_counts[s.id]?.count ?? 0}
                            </p>
                            <p className="text-[13px] text-gray-600">{s.name}</p>
                            <p className="text-xs text-gray-500">{money(data.meta.status_counts[s.id]?.amount ?? 0)}</p>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(`/estimates/new${customerId ? `?customer_id=${customerId}` : ''}`)}>
                        <Plus className="h-4 w-4" /> Create New Estimate
                    </Button>
                )}
                <div className="flex rounded-lg border border-gray-300 bg-white p-0.5">
                    <button type="button" onClick={() => setView('list')} className={`rounded-md px-2.5 py-1.5 ${view === 'list' ? 'bg-gray-100' : 'text-gray-500'}`} title="List">
                        <List className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setView('pipeline')} className={`rounded-md px-2.5 py-1.5 ${view === 'pipeline' ? 'bg-gray-100' : 'text-gray-500'}`} title="Pipeline">
                        <Columns3 className="h-4 w-4" />
                    </button>
                </div>
                {view === 'list' &&
                    ESTIMATE_STATUSES.map((s) => {
                        const active = statuses.includes(s.id);

                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => (setStatuses((l) => (active ? l.filter((x) => x !== s.id) : [...l, s.id])), setPage(1))}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${active ? 'bg-white shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
                                style={active ? { borderColor: s.color, color: s.color } : undefined}
                            >
                                {s.name}
                            </button>
                        );
                    })}
                <span className="ml-auto" />
                {!customerId && !projectId && <SavedFilters identifier="estimates" current={{ statuses, search }} onApply={(f) => { setStatuses(savedIds(f.statuses)); setSearch(savedText(f.search)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState icon={Calculator} title="No estimates found" text="Estimates turn into invoices with one click once the customer agrees." action={canCreate && <Button onClick={() => navigate(`/estimates/new${customerId ? `?customer_id=${customerId}` : ''}`)}><Plus className="h-4 w-4" /> Create an estimate</Button>} />
            ) : view === 'pipeline' ? (
                <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                    <div className="flex min-w-max gap-4">
                        {ESTIMATE_STATUSES.map((s) => (
                            <div key={s.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, s.id)} className="kanban-col">
                                <div className="kanban-head" style={{ '--col': s.color } as CSSProperties}>
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                                    <span className="truncate text-[13.5px] font-semibold text-slate-800">{s.name}</span>
                                    <span className="kanban-count">{data.data.filter((est) => est.status === s.id).length}</span>
                                </div>
                                <div className="flex min-h-[6rem] flex-col gap-2 p-2">
                                    {data.data
                                        .filter((est) => est.status === s.id)
                                        .map((est) => (
                                            <div
                                                key={est.id}
                                                draggable={est.can.update}
                                                onDragStart={() => setDragging(est.id)}
                                                onClick={() => navigate(`/estimates/${est.id}`)}
                                                className="kanban-card text-[13px]"
                                            >
                                                <p className="font-semibold text-brand">{est.formatted_number}</p>
                                                <p className="truncate text-slate-600">{est.customer?.name}</p>
                                                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                                                    <span className="font-semibold text-slate-700">{money(est.total, est.currency)}</span>
                                                    <span>{formatDate(est.date)}</span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Estimate #</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">Total Tax</th>
                                    {!customerId && <th>Customer</th>}
                                    {!projectId && <th>Project</th>}
                                    <th>Tags</th>
                                    <th>Date</th>
                                    <th>Expiry Date</th>
                                    <th>Reference #</th>
                                    <th>Status</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((est) => (
                                    <tr key={est.id}>
                                        <td>
                                            <Link to={`/estimates/${est.id}`} className="font-medium">
                                                {est.formatted_number}
                                            </Link>
                                            {est.invoice && <span className="ml-1.5 text-[11px] text-gray-500">(invoiced)</span>}
                                            <div className="row-options">
                                                <Link to={`/estimates/${est.id}`}>View</Link>
                                                {est.can.update && (
                                                    <>
                                                        <span className="divider">|</span>
                                                        <Link to={`/estimates/${est.id}/edit`}>Edit</Link>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-right">{money(est.total, est.currency)}</td>
                                        <td className="text-right">{money(est.total_tax, est.currency)}</td>
                                        {!customerId && (
                                            <td>
                                                <Link to={`/customers/${est.customer?.id}`}>{est.customer?.name}</Link>
                                            </td>
                                        )}
                                        {!projectId && <td>{est.project ? <Link to={`/projects/${est.project.id}`}>{est.project.name}</Link> : ''}</td>}
                                        <td>
                                            <div className="flex flex-wrap gap-1">{est.tags?.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                                        </td>
                                        <td className="whitespace-nowrap">{formatDate(est.date)}</td>
                                        <td className="whitespace-nowrap">{formatDate(est.expiry_date)}</td>
                                        <td>{est.reference_no}</td>
                                        <td>
                                            <StatusBadge option={optionById(ESTIMATE_STATUSES, est.status)} />
                                        </td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, est.id)}</td>
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
    );
}

export default function EstimatesPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Estimates</h4>
            <EstimatesTable />
        </div>
    );
}
