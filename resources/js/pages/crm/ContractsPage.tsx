import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSignature, Plus, Search } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { SummaryCard, Button, EmptyState, ErrorNote, Input, Pagination, Spinner } from '../../components/ui';
import type { Contract, Paginated } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type ContractList = Paginated<Contract> & { meta: { summary: Record<'active' | 'expired' | 'about_to_expire' | 'recently_added' | 'trash', number> } };

export function ContractsTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const canCreate = usePermission('contracts.create');
    const [filter, setFilter] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<ContractList>('/contracts', { search, page, filter: filter || undefined, customer_id: customerId, project_id: projectId });
    const cfCols = useCustomFieldColumns('contracts', (data?.data ?? []).map((r) => r.id));

    const boxes: [string, string, string][] = [
        ['active', 'Active', '#2563eb'],
        ['expired', 'Expired', '#dc2626'],
        ['about_to_expire', 'About to Expire', '#d97706'],
        ['recently_added', 'Recently Added', '#16a34a'],
        ['trash', 'Trash', '#64748b'],
    ];

    return (
        <div className="space-y-4">
            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {boxes.map(([key, label, color]) => (
                        <SummaryCard key={key} label={label} color={color} value={data.meta.summary[key as keyof ContractList['meta']['summary']]} active={filter === key} onClick={() => (setFilter(filter === key ? '' : key), setPage(1))} />
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(`/contracts/new${customerId ? `?customer_id=${customerId}${projectId ? `&project_id=${projectId}` : ''}` : ''}`)}>
                        <Plus className="h-4 w-4" /> New Contract
                    </Button>
                )}
                <span className="ml-auto" />
                {!customerId && <SavedFilters identifier="contracts" current={{ filter, search }} onApply={(f) => { setFilter(savedText(f.filter)); setSearch(savedText(f.search)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState icon={FileSignature} title="No contracts found" text="Keep your customer contracts here and get reminded before they expire." action={canCreate && <Button onClick={() => navigate(`/contracts/new${customerId ? `?customer_id=${customerId}${projectId ? `&project_id=${projectId}` : ''}` : ''}`)}><Plus className="h-4 w-4" /> Add a contract</Button>} />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Subject</th>
                                    {!customerId && <th>Customer</th>}
                                    <th>Contract Type</th>
                                    <th className="text-right">Contract Value</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Signature</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((c) => (
                                    <tr key={c.id}>
                                        <td>{c.id}</td>
                                        <td>
                                            <Link to={`/contracts/${c.id}`} className="font-medium">
                                                {c.subject}
                                            </Link>
                                            {c.is_expired && <span className="ml-1.5 text-[11px] text-red-600">Expired</span>}
                                        </td>
                                        {!customerId && (
                                            <td>
                                                <Link to={`/customers/${c.customer?.id}`}>{c.customer?.name}</Link>
                                            </td>
                                        )}
                                        <td>{c.type?.name}</td>
                                        <td className="text-right">{c.contract_value ? money(c.contract_value) : ''}</td>
                                        <td className="whitespace-nowrap">{formatDate(c.start_date)}</td>
                                        <td className="whitespace-nowrap">{formatDate(c.end_date)}</td>
                                        <td>{c.signed ? <span className="text-green-600">Signed</span> : <span className="text-gray-500">Not Signed</span>}</td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, c.id)}</td>
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

export default function ContractsPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Contracts</h4>
            <ContractsTable />
        </div>
    );
}
