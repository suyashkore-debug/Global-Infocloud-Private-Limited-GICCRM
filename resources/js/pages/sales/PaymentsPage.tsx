import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Wallet } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { EmptyState, ErrorNote, Input, Pagination, Spinner } from '../../components/ui';
import type { Paginated, Payment } from '../../types';

export function PaymentsTable({ customerId }: { customerId?: number }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<Paginated<Payment>>('/payments', { search, page, customer_id: customerId });

    return (
        <div className="space-y-4">
            <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState icon={Wallet} title="No payments found" text="Payments you record on invoices are listed here." />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Payment #</th>
                                    <th>Invoice #</th>
                                    <th>Payment Mode</th>
                                    <th>Transaction ID</th>
                                    {!customerId && <th>Customer</th>}
                                    <th className="text-right">Amount</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((p) => (
                                    <tr key={p.id}>
                                        <td>{p.id}</td>
                                        <td>
                                            <Link to={`/invoices/${p.invoice?.id}`}>{p.invoice?.formatted_number}</Link>
                                        </td>
                                        <td>
                                            {p.payment_mode?.name ?? '—'}
                                            {p.payment_method && <span className="text-gray-500"> - {p.payment_method}</span>}
                                        </td>
                                        <td>{p.transaction_id}</td>
                                        {!customerId && (
                                            <td>
                                                <Link to={`/customers/${p.invoice?.customer?.id}`}>{p.invoice?.customer?.name}</Link>
                                            </td>
                                        )}
                                        <td className="text-right">{money(p.amount, p.invoice?.currency)}</td>
                                        <td className="whitespace-nowrap">{formatDate(p.date)}</td>
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

export default function PaymentsPage() {
    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Payments</h4>
            <PaymentsTable />
        </div>
    );
}
