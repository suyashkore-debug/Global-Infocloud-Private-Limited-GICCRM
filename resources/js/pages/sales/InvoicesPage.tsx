import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { formatDate, isOverdue } from '../../lib/format';
import { INVOICE_STATUSES, money } from '../../lib/sales';
import { optionById } from '../../lib/constants';
import { Button, EmptyState, ErrorNote, Input, Pagination, Spinner, StatusBadge, Tag } from '../../components/ui';
import type { Invoice, Paginated } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type InvoiceList = Paginated<Invoice> & { meta: { status_counts: Record<string, number>; summary: { outstanding: number; past_due: number; paid: number } } };

/**
 * Perfex invoices list, optionally limited to one customer or project (customer / project tabs).
 */
export function InvoicesTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const canCreate = usePermission('invoices.create');
    const [statuses, setStatuses] = useState<number[]>([]);
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<InvoiceList>('/invoices', {
        search,
        page,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        customer_id: customerId,
        project_id: projectId,
        ...(statuses.length ? { status: statuses } : {}),
    });
    const cfCols = useCustomFieldColumns('invoice', (data?.data ?? []).map((r) => r.id));

    const newLink = `/invoices/new${customerId ? `?customer_id=${customerId}` : ''}${projectId ? `${customerId ? '&' : '?'}project_id=${projectId}` : ''}`;

    return (
        <div className="space-y-4">
            {data && (
                <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryBox label="Outstanding Invoices" value={money(data.meta.summary.outstanding)} color="text-amber-600" />
                    <SummaryBox label="Past Due Invoices" value={money(data.meta.summary.past_due)} color="text-red-600" />
                    <SummaryBox label="Paid Invoices" value={money(data.meta.summary.paid)} color="text-green-600" />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(newLink)}>
                        <Plus className="h-4 w-4" /> Create New Invoice
                    </Button>
                )}
                <div className="flex flex-wrap gap-1.5">
                    {INVOICE_STATUSES.map((s) => {
                        const active = statuses.includes(s.id);

                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => (setStatuses((list) => (active ? list.filter((x) => x !== s.id) : [...list, s.id])), setPage(1))}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${active ? 'bg-white shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
                                style={active ? { borderColor: s.color, color: s.color } : undefined}
                            >
                                {s.name} {data?.meta.status_counts[s.id] ?? 0}
                            </button>
                        );
                    })}
                </div>
                <span className="ml-auto" />
                <label className="flex items-center gap-1.5 text-[13px] text-gray-600">
                    Date
                    <Input type="date" value={dateFrom} onChange={(e) => (setDateFrom(e.target.value), setPage(1))} className="w-auto" aria-label="Invoice date from" />
                    –
                    <Input type="date" value={dateTo} onChange={(e) => (setDateTo(e.target.value), setPage(1))} className="w-auto" aria-label="Invoice date to" />
                </label>
                {!customerId && !projectId && <SavedFilters identifier="invoices" current={{ statuses, search, from: dateFrom, to: dateTo }} onApply={(f) => { setStatuses(savedIds(f.statuses)); setSearch(savedText(f.search)); setDateFrom(savedText(f.from)); setDateTo(savedText(f.to)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>

            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState title="No invoices found" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">Total Tax</th>
                                    <th>Date</th>
                                    {!customerId && <th>Customer</th>}
                                    {!projectId && <th>Project</th>}
                                    <th>Tags</th>
                                    <th>Due Date</th>
                                    <th>Status</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((inv) => (
                                    <tr key={inv.id}>
                                        <td>
                                            <Link to={`/invoices/${inv.id}`} className="font-medium">
                                                {inv.formatted_number}
                                            </Link>
                                            {inv.repeat_every && <span className="ml-1.5 text-[11px] text-gray-500">(recurring)</span>}
                                            <div className="row-options">
                                                <Link to={`/invoices/${inv.id}`}>View</Link>
                                                {inv.can.update && (
                                                    <>
                                                        <span className="divider">|</span>
                                                        <Link to={`/invoices/${inv.id}/edit`}>Edit</Link>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-right">{money(inv.total, inv.currency)}</td>
                                        <td className="text-right">{money(inv.total_tax, inv.currency)}</td>
                                        <td className="whitespace-nowrap">{formatDate(inv.date)}</td>
                                        {!customerId && (
                                            <td>
                                                <Link to={`/customers/${inv.customer?.id}`}>{inv.customer?.name}</Link>
                                            </td>
                                        )}
                                        {!projectId && <td>{inv.project ? <Link to={`/projects/${inv.project.id}`}>{inv.project.name}</Link> : ''}</td>}
                                        <td>
                                            <div className="flex flex-wrap gap-1">{inv.tags?.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                                        </td>
                                        <td className={`whitespace-nowrap ${inv.status === 4 || isOverdue(inv.due_date, inv.status === 2 ? 5 : 1) ? 'text-red-600' : ''}`}>{formatDate(inv.due_date)}</td>
                                        <td>
                                            <StatusBadge option={optionById(INVOICE_STATUSES, inv.status)} />
                                        </td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, inv.id)}</td>
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

function SummaryBox({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <span className={`absolute inset-y-0 left-0 w-[3px] bg-current ${color}`} />
            <p className="text-[12.5px] font-semibold text-slate-500">{label}</p>
            <p className={`mt-0.5 text-[22px] font-bold leading-tight ${color}`}>{value}</p>
        </div>
    );
}

export default function InvoicesPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Invoices</h4>
            <InvoicesTable />
        </div>
    );
}
