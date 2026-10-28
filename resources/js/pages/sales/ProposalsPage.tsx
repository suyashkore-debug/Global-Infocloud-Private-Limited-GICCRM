import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { money, PROPOSAL_STATUSES } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Input, Pagination, Spinner, StatusBadge, Tag } from '../../components/ui';
import type { Paginated, Proposal } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type ProposalList = Paginated<Proposal> & { meta: { status_counts: Record<string, number> } };

export function ProposalsTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const canCreate = usePermission('proposals.create');
    const [statuses, setStatuses] = useState<number[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<ProposalList>('/proposals', { search, page, customer_id: customerId, project_id: projectId, ...(statuses.length ? { status: statuses } : {}) });
    const cfCols = useCustomFieldColumns('proposal', (data?.data ?? []).map((r) => r.id));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(`/proposals/new${customerId ? `?customer_id=${customerId}${projectId ? `&project_id=${projectId}` : ''}` : ''}`)}>
                        <Plus className="h-4 w-4" /> New Proposal
                    </Button>
                )}
                {PROPOSAL_STATUSES.map((s) => {
                    const active = statuses.includes(s.id);

                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => (setStatuses((l) => (active ? l.filter((x) => x !== s.id) : [...l, s.id])), setPage(1))}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${active ? 'bg-white shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
                            style={active ? { borderColor: s.color, color: s.color } : undefined}
                        >
                            {s.name} {data?.meta.status_counts[s.id] ?? 0}
                        </button>
                    );
                })}
                <span className="ml-auto" />
                {!customerId && <SavedFilters identifier="proposals" current={{ statuses, search }} onApply={(f) => { setStatuses(savedIds(f.statuses)); setSearch(savedText(f.search)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState title="No proposals found" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Proposal #</th>
                                    <th>Subject</th>
                                    <th>To</th>
                                    <th className="text-right">Total</th>
                                    <th>Date</th>
                                    <th>Open Till</th>
                                    <th>Tags</th>
                                    <th>Date Created</th>
                                    <th>Status</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((p) => (
                                    <tr key={p.id}>
                                        <td>
                                            <Link to={`/proposals/${p.id}`} className="font-medium">
                                                {p.formatted_number}
                                            </Link>
                                            <div className="row-options">
                                                <Link to={`/proposals/${p.id}`}>View</Link>
                                                {p.can.update && (
                                                    <>
                                                        <span className="divider">|</span>
                                                        <Link to={`/proposals/${p.id}/edit`}>Edit</Link>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td>{p.subject}</td>
                                        <td>{p.customer ? <Link to={`/customers/${p.customer.id}`}>{p.proposal_to}</Link> : p.proposal_to}</td>
                                        <td className="text-right">{money(p.total, p.currency)}</td>
                                        <td className="whitespace-nowrap">{formatDate(p.date)}</td>
                                        <td className="whitespace-nowrap">{formatDate(p.open_till)}</td>
                                        <td>
                                            <div className="flex flex-wrap gap-1">{p.tags?.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                                        </td>
                                        <td className="whitespace-nowrap">{formatDate(p.created_at)}</td>
                                        <td>
                                            <StatusBadge option={optionById(PROPOSAL_STATUSES, p.status)} />
                                        </td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, p.id)}</td>
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

export default function ProposalsPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Proposals</h4>
            <ProposalsTable />
        </div>
    );
}
