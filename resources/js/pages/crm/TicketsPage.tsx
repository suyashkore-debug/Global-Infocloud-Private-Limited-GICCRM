import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { SummaryCard, Button, EmptyState, ErrorNote, Input, Pagination, Select, Spinner, StatusBadge, Tag } from '../../components/ui';
import type { Paginated, Ticket, TicketStatus } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type TicketList = Paginated<Ticket> & { meta: { summary: TicketStatus[] } };

export function TicketsTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const [statuses, setStatuses] = useState<number[]>([]);
    const [filter, setFilter] = useState('');
    const [department, setDepartment] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const departments = useApi<{ data: { id: number; name: string }[] }>('/setup/support-departments');
    const { data, loading, error } = useApi<TicketList>('/tickets', {
        search,
        page,
        customer_id: customerId,
        project_id: projectId,
        department_id: department || undefined,
        ...(filter ? { [filter]: 1 } : {}),
        ...(statuses.length ? { status: statuses } : {}),
    });
    const cfCols = useCustomFieldColumns('tickets', (data?.data ?? []).map((r) => r.id));

    return (
        <div className="space-y-4">
            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {data.meta.summary.map((s) => {
                        const active = statuses.includes(s.id);

                        return (
                            <SummaryCard key={s.id} label={s.name} color={s.color} value={s.count} muted={!active} onClick={() => (setStatuses((l) => (active ? l.filter((x) => x !== s.id) : [...l, s.id])), setPage(1))} />
                        );
                    })}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => navigate(`/tickets/new${customerId ? `?customer_id=${customerId}` : ''}`)}>
                    <Plus className="h-4 w-4" /> New Ticket
                </Button>
                <Select value={filter} onChange={(e) => (setFilter(e.target.value), setPage(1))} className="w-auto">
                    <option value="">All tickets</option>
                    <option value="my_tickets">My tickets</option>
                    <option value="unassigned">Unassigned</option>
                </Select>
                <Select value={department} onChange={(e) => (setDepartment(e.target.value), setPage(1))} className="w-auto">
                    <option value="">All departments</option>
                    {departments.data?.data.map((d) => (
                        <option key={d.id} value={d.id}>
                            {d.name}
                        </option>
                    ))}
                </Select>
                <span className="ml-auto" />
                {!customerId && !projectId && <SavedFilters identifier="tickets" current={{ statuses, filter, department, search }} onApply={(f) => { setStatuses(savedIds(f.statuses)); setFilter(savedText(f.filter)); setDepartment(savedText(f.department)); setSearch(savedText(f.search)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            {statuses.length === 0 && <p className="text-xs text-gray-500">Closed tickets are hidden. Click a status above to filter.</p>}
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState title="No tickets found" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Subject</th>
                                    <th>Tags</th>
                                    <th>Department</th>
                                    <th>Service</th>
                                    <th>Contact</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Last Reply</th>
                                    <th>Created</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((t) => (
                                    <tr key={t.id} className={t.admin_read ? '' : 'font-semibold'}>
                                        <td>{t.id}</td>
                                        <td>
                                            <Link to={`/tickets/${t.id}`}>{t.subject}</Link>
                                            {t.assigned && <p className="text-xs font-normal text-gray-500">Assigned: {t.assigned.full_name}</p>}
                                        </td>
                                        <td>
                                            <div className="flex flex-wrap gap-1">{t.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
                                        </td>
                                        <td>{t.department?.name}</td>
                                        <td>{t.service?.name}</td>
                                        <td>
                                            {t.requester}
                                            {t.customer && <p className="text-xs text-gray-500">{t.customer.name}</p>}
                                        </td>
                                        <td>{t.status && <StatusBadge option={{ id: t.status.id, name: t.status.name, color: t.status.color }} />}</td>
                                        <td>{t.priority?.name}</td>
                                        <td className="whitespace-nowrap">{t.last_reply_at ? timeAgo(t.last_reply_at) : 'No reply yet'}</td>
                                        <td className="whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, t.id)}</td>
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

export default function TicketsPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Support</h4>
            <TicketsTable />
        </div>
    );
}
