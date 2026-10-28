import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, Pencil } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, ErrorNote, Menu, MenuItem, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { FilesPanel } from '../../components/records/RecordPanels';
import type { Expense } from '../../types';
import { CustomFieldsView } from '../../components/customfields/CustomFields';

export default function ExpenseViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const canInvoice = usePermission('invoices.create');
    const canCreate = usePermission('expenses.create');
    const { data, error, reload } = useApi<{ data: Expense }>(`/expenses/${id}`);
    const e = data?.data;

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!e) {
        return <Spinner />;
    }

    async function convert(draft: boolean) {
        try {
            const { data: r } = await api.post<{ data: { id: number } }>(`/expenses/${e!.id}/convert`, { draft });
            toast('Expense converted to invoice.');
            navigate(`/invoices/${r.data.id}`);
        } catch (err) {
            toast(errorMessage(err), 'error');
        }
    }

    async function copy() {
        const { data: r } = await api.post<{ data: Expense }>(`/expenses/${e!.id}/copy`);
        toast('Expense copied.');
        navigate(`/expenses/${r.data.id}`);
    }

    async function remove() {
        if (!confirm('Delete this expense?')) {
            return;
        }
        await api.delete(`/expenses/${e!.id}`);
        toast('Expense deleted.');
        navigate('/expenses');
    }

    const rows: [string, React.ReactNode][] = [
        ['Category', e.category?.name],
        ['Name', e.name],
        ['Date', formatDate(e.date)],
        ['Amount', money(e.amount, e.currency)],
        ['Tax', [e.tax, e.tax2].filter(Boolean).map((t) => `${t!.name} ${Number(t!.rate)}%`).join(', ') || '—'],
        ['Total (incl. tax)', money(e.total_with_tax, e.currency)],
        ['Customer', e.customer ? <Link to={`/customers/${e.customer.id}`}>{e.customer.name}</Link> : '—'],
        ['Project', e.project ? <Link to={`/projects/${e.project.id}`}>{e.project.name}</Link> : '—'],
        ['Billable', e.billable ? 'Yes' : 'No'],
        ['Invoice', e.invoice ? <Link to={`/invoices/${e.invoice.id}`}>{e.invoice.formatted_number}</Link> : '—'],
        ['Payment Mode', e.payment_mode?.name ?? '—'],
        ['Reference #', e.reference_no ?? '—'],
        ['Recurring', e.repeat_every ? `Every ${e.repeat_every} ${e.recurring_type}(s)` : 'No'],
    ];

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-auto">Expense #{e.id}</h4>
                {e.can.update && (
                    <Button variant="secondary" onClick={() => navigate(`/expenses/${e.id}/edit`)}>
                        <Pencil className="h-4 w-4" /> Edit
                    </Button>
                )}
                {e.billable && !e.invoice && e.customer && e.can.update && canInvoice && (
                    <Menu
                        trigger={(toggle) => (
                            <Button onClick={toggle}>
                                Convert to Invoice <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                <MenuItem onClick={() => (close(), convert(false))}>Convert</MenuItem>
                                <MenuItem onClick={() => (close(), convert(true))}>Convert and save as draft</MenuItem>
                            </>
                        )}
                    </Menu>
                )}
                <Menu
                    trigger={(toggle) => (
                        <Button variant="secondary" onClick={toggle}>
                            More <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                    )}
                >
                    {(close) => (
                        <>
                            {canCreate && <MenuItem onClick={() => (close(), copy())}>Copy</MenuItem>}
                            {e.can.delete && (
                                <MenuItem danger onClick={() => (close(), remove())}>
                                    Delete
                                </MenuItem>
                            )}
                        </>
                    )}
                </Menu>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="panel_s lg:col-span-2">
                    <div className="panel-body">
                        <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                            {rows.map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-gray-500">{label}</dt>
                                    <dd className="font-medium">{value || '—'}</dd>
                                </div>
                            ))}
                        </dl>
                        <CustomFieldsView to="expenses" id={e.id} className="mt-4 border-t border-gray-100 pt-4" />
                        {e.note && <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-[13.5px] text-gray-700">{e.note}</p>}
                    </div>
                </div>
                <div className="panel_s">
                    <div className="panel-body">
                        <h5 className="mb-3 font-semibold">Receipt</h5>
                        <FilesPanel type="expense" id={e.id} files={e.attachments ?? []} canUpload={e.can.update} onChange={reload} />
                    </div>
                </div>
            </div>
        </div>
    );
}
