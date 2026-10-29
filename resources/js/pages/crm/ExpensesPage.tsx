import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Wallet } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Input, Pagination, Select, Spinner } from '../../components/ui';
import type { Expense, Paginated } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type ExpenseList = Paginated<Expense> & { meta: { summary: Record<'total' | 'billable' | 'non_billable' | 'not_invoiced' | 'billed', number> } };

export function ExpensesTable({ customerId, projectId }: { customerId?: number; projectId?: number }) {
    const navigate = useNavigate();
    const canCreate = usePermission('expenses.create');
    const [filter, setFilter] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<ExpenseList>('/expenses', { search, page, filter: filter || undefined, customer_id: customerId, project_id: projectId });
    const cfCols = useCustomFieldColumns('expenses', (data?.data ?? []).map((r) => r.id));

    const boxes: [keyof ExpenseList['meta']['summary'], string, string][] = [
        ['total', 'Total', 'text-gray-800'],
        ['billable', 'Billable', 'text-blue-600'],
        ['non_billable', 'Non Billable', 'text-gray-600'],
        ['not_invoiced', 'Not Invoiced', 'text-amber-600'],
        ['billed', 'Billed', 'text-green-600'],
    ];

    return (
        <div className="space-y-4">
            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {boxes.map(([key, label, color]) => (
                        <div key={key} className="rounded-lg border border-gray-300/60 bg-white px-4 py-3 shadow-sm">
                            <p className={`text-lg font-semibold ${color}`}>{money(data.meta.summary[key])}</p>
                            <p className="text-[13px] text-gray-600">{label}</p>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(`/expenses/new${customerId ? `?customer_id=${customerId}` : ''}${projectId ? `${customerId ? '&' : '?'}project_id=${projectId}` : ''}`)}>
                        <Plus className="h-4 w-4" /> Record Expense
                    </Button>
                )}
                <Select value={filter} onChange={(e) => (setFilter(e.target.value), setPage(1))} className="w-auto">
                    <option value="">All</option>
                    <option value="billable">Billable</option>
                    <option value="non_billable">Non Billable</option>
                    <option value="unbilled">Not Invoiced</option>
                    <option value="invoiced">Invoiced</option>
                    <option value="recurring">Recurring</option>
                </Select>
                <span className="ml-auto" />
                {!customerId && !projectId && <SavedFilters identifier="expenses" current={{ filter, search }} onApply={(f) => { setFilter(savedText(f.filter)); setSearch(savedText(f.search)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState icon={Wallet} title="No expenses found" text="Record what you spend, and bill it to a customer when it is billable." action={canCreate && <Button onClick={() => navigate(`/expenses/new${customerId ? `?customer_id=${customerId}` : ''}${projectId ? `${customerId ? '&' : '?'}project_id=${projectId}` : ''}`)}><Plus className="h-4 w-4" /> Record an expense</Button>} />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th className="text-right">Amount</th>
                                    <th>Name</th>
                                    <th>Date</th>
                                    {!projectId && <th>Project</th>}
                                    {!customerId && <th>Customer</th>}
                                    <th>Invoice</th>
                                    <th>Reference #</th>
                                    <th>Payment Mode</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((e) => (
                                    <tr key={e.id}>
                                        <td>
                                            <Link to={`/expenses/${e.id}`} className="font-medium">
                                                {e.category?.name}
                                            </Link>
                                            {e.billable && <span className="ml-1.5 text-[11px] text-blue-600">Billable</span>}
                                            <div className="row-options">
                                                <Link to={`/expenses/${e.id}`}>View</Link>
                                                {e.can.update && (
                                                    <>
                                                        <span className="divider">|</span>
                                                        <Link to={`/expenses/${e.id}/edit`}>Edit</Link>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-right">{money(e.total_with_tax ?? e.amount, e.currency)}</td>
                                        <td>{e.name}</td>
                                        <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                                        {!projectId && <td>{e.project ? <Link to={`/projects/${e.project.id}`}>{e.project.name}</Link> : ''}</td>}
                                        {!customerId && <td>{e.customer ? <Link to={`/customers/${e.customer.id}`}>{e.customer.name}</Link> : ''}</td>}
                                        <td>{e.invoice ? <Link to={`/invoices/${e.invoice.id}`}>{e.invoice.formatted_number}</Link> : ''}</td>
                                        <td>{e.reference_no}</td>
                                        <td>{e.payment_mode?.name}</td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, e.id)}</td>
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

export default function ExpensesPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Expenses</h4>
            <ExpensesTable />
        </div>
    );
}
