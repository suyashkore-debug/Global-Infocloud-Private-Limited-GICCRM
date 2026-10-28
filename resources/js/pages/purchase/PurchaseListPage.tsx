import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { formatDate, formatDateTime } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Input, Pagination, Select, Spinner } from '../../components/ui';
import { PAYMENT_STATUSES, PURCHASE_STATUSES, StatusPill, TITLES, type CurrencyLite, type DocType } from './shared';

type Row = Record<string, unknown> & { id: number; currency: CurrencyLite };
type List = { data: Row[]; meta: { current_page: number; last_page: number; total: number; summary?: { total: number; paid: number } } };

const PERMISSION: Record<DocType, string> = { requests: 'purchase_requests.create', orders: 'purchase_orders.create', invoices: 'purchase_invoices.create' };

/** Perfex purchase lists: requests, orders and invoices (vendor bills). */
export default function PurchaseListPage({ type }: { type: DocType }) {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const vendorId = params.get('vendor_id') ?? undefined;
    const canCreate = usePermission(PERMISSION[type]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);
    const t = TITLES[type];
    const { data, loading, error } = useApi<List>(`/purchase/${type}`, {
        search: search || undefined,
        page,
        vendor_id: vendorId,
        ...(type === 'invoices' ? { payment_status: status || undefined } : { status: status || undefined }),
    });

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">{t.list}</h4>
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate(`${t.path}/new`)}>
                        <Plus className="h-4 w-4" /> New {t.one}
                    </Button>
                )}
                <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-44">
                    <option value="">All statuses</option>
                    {type === 'invoices'
                        ? Object.entries(PAYMENT_STATUSES).map(([k, v]) => (
                              <option key={k} value={k}>
                                  {v.name}
                              </option>
                          ))
                        : Object.entries(PURCHASE_STATUSES).map(([k, v]) => (
                              <option key={k} value={k}>
                                  {v.name}
                              </option>
                          ))}
                </Select>
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            {data?.meta.summary && (
                <div className="flex flex-wrap gap-6 text-[13px]">
                    <span>
                        Total: <b>{money(data.meta.summary.total)}</b>
                    </span>
                    <span>
                        Paid: <b className="text-green-700">{money(data.meta.summary.paid)}</b>
                    </span>
                    <span>
                        Due: <b className="text-red-600">{money(data.meta.summary.total - data.meta.summary.paid)}</b>
                    </span>
                </div>
            )}
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data ? null : data.data.length === 0 ? (
                <EmptyState title={`No ${t.list.toLowerCase()} yet`} />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                {type === 'requests' && (
                                    <tr>
                                        <th>Code</th>
                                        <th>Name</th>
                                        <th>Requester</th>
                                        <th>Department</th>
                                        <th>Request Date</th>
                                        <th className="text-right">Total</th>
                                        <th>Status</th>
                                    </tr>
                                )}
                                {type === 'orders' && (
                                    <tr>
                                        <th>Purchase Order</th>
                                        <th>Vendor</th>
                                        <th>Order Date</th>
                                        <th>Delivery Date</th>
                                        <th className="text-right">Total</th>
                                        <th>Approval</th>
                                    </tr>
                                )}
                                {type === 'invoices' && (
                                    <tr>
                                        <th>Invoice #</th>
                                        <th>Vendor Invoice #</th>
                                        <th>Vendor</th>
                                        <th>Invoice Date</th>
                                        <th>Due Date</th>
                                        <th className="text-right">Total</th>
                                        <th className="text-right">Paid</th>
                                        <th>Payment</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {data.data.map((r) => (
                                    <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`${t.path}/${r.id}`)}>
                                        {type === 'requests' && (
                                            <>
                                                <td className="font-medium text-blue-600">{r.code as string}</td>
                                                <td>{r.name as string}</td>
                                                <td>{r.requester as string}</td>
                                                <td>{r.department as string}</td>
                                                <td className="whitespace-nowrap">{formatDateTime(r.request_date as string)}</td>
                                                <td className="text-right">{money(r.total as number, r.currency)}</td>
                                                <td>
                                                    <StatusPill status={PURCHASE_STATUSES[r.status as number]} />
                                                </td>
                                            </>
                                        )}
                                        {type === 'orders' && (
                                            <>
                                                <td>
                                                    <span className="font-medium text-blue-600">{r.code as string}</span>
                                                    <span className="block text-xs text-gray-500">{r.name as string}</span>
                                                </td>
                                                <td>{(r.vendor as { name: string } | null)?.name}</td>
                                                <td>{formatDate(r.order_date as string)}</td>
                                                <td>{formatDate(r.delivery_date as string)}</td>
                                                <td className="text-right">{money(r.total as number, r.currency)}</td>
                                                <td>
                                                    <StatusPill status={PURCHASE_STATUSES[r.status as number]} />
                                                </td>
                                            </>
                                        )}
                                        {type === 'invoices' && (
                                            <>
                                                <td className="font-medium text-blue-600">{r.invoice_number as string}</td>
                                                <td>{r.vendor_invoice_number as string}</td>
                                                <td>{(r.vendor as { name: string } | null)?.name}</td>
                                                <td>{formatDate(r.invoice_date as string)}</td>
                                                <td>{formatDate(r.due_date as string)}</td>
                                                <td className="text-right">{money(r.total as number, r.currency)}</td>
                                                <td className="text-right">{money(r.paid as number, r.currency)}</td>
                                                <td>
                                                    <StatusPill status={PAYMENT_STATUSES[r.payment_status as string]} />
                                                </td>
                                            </>
                                        )}
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
