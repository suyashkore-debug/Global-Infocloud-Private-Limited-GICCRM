import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, FileDown, Pencil, Wallet } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { INVOICE_STATUSES, money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, ErrorNote, Menu, MenuItem, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Address, Invoice } from '../../types';
import RecordPaymentModal from './RecordPaymentModal';
import { useCelebrateWhen } from '../../lib/celebrate';
import { CustomFieldsView } from '../../components/customfields/CustomFields';
import SendEmailButton from '../../components/email/SendEmailButton';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

/** Open or download a PDF through the API (it needs the login token). */
export async function openPdf(url: string, fileName: string, download: boolean): Promise<void> {
    const response = await api.get(url, { responseType: 'blob', params: download ? {} : { inline: 1 } });
    const blobUrl = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'application/pdf' }));
    if (download) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.click();
    } else {
        window.open(blobUrl, '_blank', 'noopener');
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

export default function InvoiceViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const canCreate = usePermission('invoices.create');
    const canDeletePayments = usePermission('payments.delete');
    const { data, error, reload, setData } = useApi<{ data: Invoice }>(`/invoices/${id}`);
    const [tab, setTab] = useState<'invoice' | 'payments'>('invoice');
    const [paymentOpen, setPaymentOpen] = useState(false);
    const invoice = data?.data;
    useCelebrateWhen(invoice ? invoice.status === 2 : undefined, invoice?.id);
    usePageCrumb(invoice?.formatted_number);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!invoice) {
        return <Spinner />;
    }

    async function action(name: string, success: string) {
        try {
            const { data: result } = await api.post<{ data: Invoice }>(`/invoices/${invoice!.id}/action`, { action: name });
            setData(result);
            toast(success);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function copy() {
        try {
            const { data: result } = await api.post<{ data: Invoice }>(`/invoices/${invoice!.id}/copy`);
            toast('Invoice copied.');
            navigate(`/invoices/${result.data.id}`);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm(`Delete invoice ${invoice!.formatted_number}?`)) {
            return;
        }
        try {
            await api.delete(`/invoices/${invoice!.id}`);
            toast('Invoice deleted.');
            navigate('/invoices');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function deletePayment(paymentId: number) {
        if (!confirm('Delete this payment?')) {
            return;
        }
        try {
            await api.delete(`/payments/${paymentId}`);
            toast('Payment deleted.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const fileName = `${invoice.formatted_number.replace(/[/\\]/g, '-')}.pdf`;
    const pdfUrl = `/invoices/${invoice.id}/pdf`;
    const cur = invoice.currency;
    const taxSummary = new Map<string, number>();
    for (const item of invoice.items ?? []) {
        for (const t of item.taxes) {
            const key = `${t.tax_name} (${Number(t.tax_rate)}%)`;
            taxSummary.set(key, (taxSummary.get(key) ?? 0) + (Number(item.qty) * Number(item.rate) * Number(t.tax_rate)) / 100);
        }
    }
    if (invoice.discount_type === 'before_tax' && Number(invoice.subtotal) > 0) {
        const share = Number(invoice.discount_total) / Number(invoice.subtotal);
        taxSummary.forEach((v, k) => taxSummary.set(k, v - v * share));
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-2 flex items-center gap-2">
                    {invoice.formatted_number} <StatusBadge option={optionById(INVOICE_STATUSES, invoice.status)} />
                </h4>
                {invoice.sent && <span className="text-xs text-gray-500">Sent {formatDate(invoice.sent_at)}</span>}
                <div className="ml-auto flex flex-wrap gap-2">
                    {invoice.can.update && (
                        <Button variant="secondary" onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
                            <Pencil className="h-4 w-4" /> Edit
                        </Button>
                    )}
                    <SendEmailButton type="invoices" id={invoice.id} onSent={reload} />
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                <FileDown className="h-4 w-4" /> PDF <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                <MenuItem onClick={() => (close(), openPdf(pdfUrl, fileName, false))}>View PDF</MenuItem>
                                <MenuItem onClick={() => (close(), openPdf(pdfUrl, fileName, true))}>Download</MenuItem>
                            </>
                        )}
                    </Menu>
                    {invoice.can.record_payment && invoice.status !== 2 && invoice.status !== 5 && invoice.status !== 6 && (
                        <Button onClick={() => setPaymentOpen(true)}>
                            <Wallet className="h-4 w-4" /> Payment
                        </Button>
                    )}
                    {invoice.status === 6 && invoice.can.update && <Button onClick={() => action('publish', 'Invoice is no longer a draft.')}>Mark as Unpaid (publish)</Button>}
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                More <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                {invoice.can.update && !invoice.sent && invoice.status !== 6 && <MenuItem onClick={() => (close(), action('mark_sent', 'Marked as sent.'))}>Mark as Sent</MenuItem>}
                                {invoice.can.update && invoice.status !== 5 && invoice.status !== 6 && <MenuItem onClick={() => (close(), action('cancel', 'Invoice cancelled.'))}>Mark as Cancelled</MenuItem>}
                                {invoice.can.update && invoice.status === 5 && <MenuItem onClick={() => (close(), action('uncancel', 'Invoice restored.'))}>Unmark as Cancelled</MenuItem>}
                                {canCreate && <MenuItem onClick={() => (close(), copy())}>Copy Invoice</MenuItem>}
                                {invoice.can.delete && (
                                    <MenuItem danger onClick={() => (close(), remove())}>
                                        Delete Invoice
                                    </MenuItem>
                                )}
                            </>
                        )}
                    </Menu>
                </div>
            </div>

            <Tabs
                tabs={[
                    { id: 'invoice', label: 'Invoice' },
                    { id: 'payments', label: 'Payments', count: invoice.payments?.length ?? 0 },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'invoice' && (
                <div className="panel_s">
                    <div className="panel-body space-y-6 text-[13.5px]">
                        <div className="flex flex-wrap justify-between gap-6">
                            <div>
                                <p className="font-semibold text-gray-800">Bill To:</p>
                                <Link to={`/customers/${invoice.customer?.id}`} className="font-semibold">
                                    {invoice.customer?.name}
                                </Link>
                                <AddressLines address={invoice.billing} />
                                {invoice.customer?.vat && <p>GSTIN: {invoice.customer.vat}</p>}
                                {invoice.include_shipping && invoice.show_shipping_on_invoice && (
                                    <div className="mt-3">
                                        <p className="font-semibold text-gray-800">Ship To:</p>
                                        <AddressLines address={invoice.shipping} />
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                <p>
                                    <span className="text-gray-500">Invoice Date:</span> {formatDate(invoice.date)}
                                </p>
                                {invoice.due_date && (
                                    <p>
                                        <span className="text-gray-500">Due Date:</span> {formatDate(invoice.due_date)}
                                    </p>
                                )}
                                {invoice.sale_agent && (
                                    <p>
                                        <span className="text-gray-500">Sale Agent:</span> {invoice.sale_agent.full_name}
                                    </p>
                                )}
                                {invoice.project && (
                                    <p>
                                        <span className="text-gray-500">Project:</span> <Link to={`/projects/${invoice.project.id}`}>{invoice.project.name}</Link>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table data-nosort className="table-perfex">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th>#</th>
                                        <th>Item</th>
                                        <th className="text-right">{['Qty', 'Hours', 'Qty/Hours'][invoice.show_quantity_as - 1]}</th>
                                        <th className="text-right">Rate</th>
                                        <th className="text-right">Tax</th>
                                        <th className="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoice.items?.map((item, i) => (
                                        <tr key={item.id ?? i}>
                                            <td>{i + 1}</td>
                                            <td>
                                                <p className="font-medium">{item.description}</p>
                                                {item.long_description && <p className="whitespace-pre-wrap text-gray-500">{item.long_description}</p>}
                                                {item.hsn_code && <p className="text-xs text-gray-500">HSN/SAC: {item.hsn_code}</p>}
                                            </td>
                                            <td className="text-right">
                                                {Number(item.qty)} {item.unit}
                                            </td>
                                            <td className="text-right">{Number(item.rate).toFixed(2)}</td>
                                            <td className="text-right">{item.taxes.map((t) => `${t.tax_name} ${Number(t.tax_rate)}%`).join(', ') || '0%'}</td>
                                            <td className="text-right">{(Number(item.qty) * Number(item.rate)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end">
                            <table className="w-full max-w-sm">
                                <tbody>
                                    <Row label="Sub Total" value={money(invoice.subtotal, cur)} />
                                    {Number(invoice.discount_total) > 0 && <Row label={`Discount${Number(invoice.discount_percent) > 0 ? ` (${Number(invoice.discount_percent)}%)` : ''}`} value={`-${money(invoice.discount_total, cur)}`} />}
                                    {[...taxSummary.entries()].map(([name, amount]) => (
                                        <Row key={name} label={name} value={money(amount, cur)} />
                                    ))}
                                    {Number(invoice.adjustment) !== 0 && <Row label="Adjustment" value={money(invoice.adjustment, cur)} />}
                                    <Row label="Total" value={money(invoice.total, cur)} strong />
                                    {Number(invoice.amount_paid) > 0 && <Row label="Total Paid" value={`-${money(invoice.amount_paid, cur)}`} />}
                                    {invoice.credits_applied > 0 && <Row label="Applied Credits" value={`-${money(invoice.credits_applied, cur)}`} />}
                                    {(Number(invoice.amount_paid) > 0 || invoice.credits_applied > 0) && <Row label="Amount Due" value={money(invoice.amount_due, cur)} strong danger />}
                                </tbody>
                            </table>
                        </div>

                        {invoice.client_note && (
                            <div>
                                <p className="font-semibold">Note:</p>
                                <p className="whitespace-pre-wrap text-gray-600">{invoice.client_note}</p>
                            </div>
                        )}
                        {invoice.terms && (
                            <div>
                                <p className="font-semibold">Terms & Conditions:</p>
                                <p className="whitespace-pre-wrap text-gray-600">{invoice.terms}</p>
                            </div>
                        )}
                        <CustomFieldsView to="invoice" id={invoice.id} />
                        {invoice.admin_note && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                                <p className="font-semibold">Admin Note (only staff see this):</p>
                                <p className="whitespace-pre-wrap">{invoice.admin_note}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'payments' && (
                <div className="panel_s overflow-hidden">
                    {(invoice.payments?.length ?? 0) === 0 ? (
                        <p className="p-6 text-gray-500">No payments recorded yet.</p>
                    ) : (
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Payment #</th>
                                    <th>Payment Mode</th>
                                    <th>Transaction ID</th>
                                    <th>Date</th>
                                    <th className="text-right">Amount</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.payments?.map((p) => (
                                    <tr key={p.id}>
                                        <td>{p.id}</td>
                                        <td>
                                            {p.payment_mode ?? '—'}
                                            {p.payment_method && <span className="text-gray-500"> - {p.payment_method}</span>}
                                        </td>
                                        <td>{p.transaction_id}</td>
                                        <td>{formatDate(p.date)}</td>
                                        <td className="text-right">{money(p.amount, cur)}</td>
                                        <td className="text-right">
                                            {canDeletePayments && (
                                                <button type="button" onClick={() => deletePayment(p.id)} className="text-xs text-red-600 hover:underline">
                                                    Delete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            <RecordPaymentModal open={paymentOpen} invoice={invoice} onClose={() => setPaymentOpen(false)} onSaved={() => (setPaymentOpen(false), reload())} />
        </div>
    );
}

function AddressLines({ address }: { address: Address }) {
    return (
        <div className="text-gray-600">
            {address.street && <p className="whitespace-pre-wrap">{address.street}</p>}
            <p>{[address.city, address.state].filter(Boolean).join(', ')}</p>
            <p>{[address.country, address.zip].filter(Boolean).join(' ')}</p>
        </div>
    );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
    return (
        <tr className={strong ? 'border-t border-gray-200' : ''}>
            <td className={`py-1.5 text-right ${strong ? 'font-semibold' : 'font-medium'} ${danger ? 'text-red-600' : ''}`}>{label}</td>
            <td className={`w-40 py-1.5 text-right ${strong ? 'font-semibold' : ''} ${danger ? 'text-red-600' : ''}`}>{value}</td>
        </tr>
    );
}
