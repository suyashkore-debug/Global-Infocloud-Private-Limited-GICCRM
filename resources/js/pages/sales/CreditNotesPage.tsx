import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { CREDIT_NOTE_STATUSES, money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Input, Pagination, Spinner, StatusBadge } from '../../components/ui';
import type { CreditNote, Paginated } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';

export function CreditNotesTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const canCreate = usePermission('credit_notes.create');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<Paginated<CreditNote>>('/credit-notes', { search, page, customer_id: customerId, project_id: projectId });
    const cfCols = useCustomFieldColumns('credit_note', (data?.data ?? []).map((r) => r.id));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(`/credit-notes/new${customerId ? `?customer_id=${customerId}${projectId ? `&project_id=${projectId}` : ''}` : ''}`)}>
                        <Plus className="h-4 w-4" /> New Credit Note
                    </Button>
                )}
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState title="No credit notes found" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Credit Note #</th>
                                    <th>Date</th>
                                    {!customerId && <th>Customer</th>}
                                    <th>Status</th>
                                    <th>Project</th>
                                    <th>Reference #</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">Remaining Amount</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((cn) => (
                                    <tr key={cn.id}>
                                        <td>
                                            <Link to={`/credit-notes/${cn.id}`} className="font-medium">
                                                {cn.formatted_number}
                                            </Link>
                                        </td>
                                        <td className="whitespace-nowrap">{formatDate(cn.date)}</td>
                                        {!customerId && (
                                            <td>
                                                <Link to={`/customers/${cn.customer?.id}`}>{cn.customer?.name}</Link>
                                            </td>
                                        )}
                                        <td>
                                            <StatusBadge option={optionById(CREDIT_NOTE_STATUSES, cn.status)} />
                                        </td>
                                        <td>{cn.project?.name}</td>
                                        <td>{cn.reference_no}</td>
                                        <td className="text-right">{money(cn.total, cn.currency)}</td>
                                        <td className="text-right">{money(cn.remaining_credits, cn.currency)}</td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, cn.id)}</td>
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

export default function CreditNotesPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Credit Notes</h4>
            <CreditNotesTable />
        </div>
    );
}
