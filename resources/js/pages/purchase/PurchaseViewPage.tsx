import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Pencil, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, todayIso } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { FilesPanelFor } from './PurchaseFiles';
import { openPdf } from '../sales/InvoiceViewPage';
import { Button, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Attachment, PaymentMode } from '../../types';
import { DELIVERY_STATUSES, PAYMENT_STATUSES, PURCHASE_STATUSES, StatusPill, TITLES, type CurrencyLite, type DocType } from './shared';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

type Doc = Record<string, unknown> & {
    id: number;
    currency: CurrencyLite;
    items: { id: number; description: string; long_description: string | null; unit: string | null; qty: number; unit_price: number; tax_name: string | null; tax_rate: number; tax_value: number; total: number }[];
    approvals?: { staff: string | null; staff_id: number; decision: number | null; note: string | null; decided_at: string | null }[];
    awaiting_my_decision?: boolean;
    payments?: { id: number; amount: number; date: string; payment_mode: string | null; transaction_id: string | null; note: string | null }[];
    attachments?: Attachment[];
    can: Record<string, boolean>;
};

/** One purchase request / order / invoice with its actions. */
export default function PurchaseViewPage({ type }: { type: DocType }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const t = TITLES[type];
    const { data, error, setData, reload } = useApi<{ data: Doc }>(`/purchase/${type}/${id}`);
    const [modal, setModal] = useState<'reject' | 'order' | 'payment' | null>(null);
    usePageCrumb(data ? String(data.data.code ?? data.data.invoice_number ?? '') || null : null);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!data) {
        return <Spinner />;
    }
    const d = data.data;
    const cur = d.currency;
    const title = type === 'invoices' ? (d.invoice_number as string) : (d.code as string);

    async function act(body: Record<string, unknown>, message: string) {
        try {
            const res = await api.post<{ data: Doc & { purchase_order_id?: number; purchase_invoice_id?: number } }>(`/purchase/${type}/${id}/action`, body);
            if (res.data.data.purchase_order_id) {
                navigate(`/purchase/orders/${res.data.data.purchase_order_id}`);
            } else if (res.data.data.purchase_invoice_id) {
                navigate(`/purchase/invoices/${res.data.data.purchase_invoice_id}`);
            } else {
                setData(res.data);
            }
            toast(message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm(`Delete ${title}?`)) {
            return;
        }
        try {
            await api.delete(`/purchase/${type}/${id}`);
            navigate(t.path);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const status = d.status as number | undefined;

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link to={t.path} className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">
                    {title} {type !== 'invoices' && <StatusPill status={PURCHASE_STATUSES[status ?? 1]} />}
                    {type === 'invoices' && <StatusPill status={PAYMENT_STATUSES[d.payment_status as string]} />}
                </h4>
                {d.awaiting_my_decision && (
                    <>
                        <Button onClick={() => act({ action: 'approve' }, 'Approved.')}>Approve</Button>
                        <Button variant="danger" onClick={() => setModal('reject')}>
                            Reject
                        </Button>
                    </>
                )}
                {type !== 'invoices' && status === 1 && d.can.edit && !(d.approvals ?? []).some((a) => a.decision === null) && (
                    <Button variant="secondary" onClick={() => act({ action: 'send_approval' }, 'Sent for approval.')}>
                        Send for approval
                    </Button>
                )}
                {type === 'requests' && d.can.to_order && <Button onClick={() => setModal('order')}>Convert to Purchase Order</Button>}
                {type === 'orders' && d.can.to_invoice && <Button onClick={() => act({ action: 'to_invoice' }, 'Invoice created.')}>Convert to Invoice</Button>}
                {type === 'invoices' && d.can.edit && Number(d.amount_due) > 0 && <Button onClick={() => setModal('payment')}>Record Payment</Button>}
                {type !== 'requests' && (
                    <Button variant="secondary" onClick={() => openPdf(`/purchase/${type}/${id}/pdf`, `${title.replace(/[#\s/]/g, '')}.pdf`, false)}>
                        <FileDown className="h-4 w-4" /> PDF
                    </Button>
                )}
                {(d.can.edit || (type === 'invoices' && d.can.edit)) && (
                    <Button variant="secondary" onClick={() => navigate(`${t.path}/${id}/edit`)}>
                        <Pencil className="h-4 w-4" /> Edit
                    </Button>
                )}
                {type !== 'invoices' && status === 2 && (d.can.manage || d.can.edit) && (
                    <Button variant="secondary" onClick={() => act({ action: 'cancel' }, 'Cancelled.')}>
                        Cancel
                    </Button>
                )}
                {d.can.delete && (
                    <Button variant="danger" onClick={remove} title="Delete">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                    <div className="panel_s">
                        <div className="panel-body space-y-4 text-[13.5px]">
                            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                                {type === 'requests' && (
                                    <>
                                        <Info label="Name">{d.name as string}</Info>
                                        <Info label="Requester">{(d.requester as { name: string } | null)?.name}</Info>
                                        <Info label="Department">{d.department as string}</Info>
                                        <Info label="Request Date">{formatDateTime(d.request_date as string)}</Info>
                                        <Info label="Project">{(d.project as { name: string } | null)?.name}</Info>
                                        {(d.orders as { id: number; code: string }[]).length > 0 && (
                                            <Info label="Purchase Orders">
                                                {(d.orders as { id: number; code: string }[]).map((o) => (
                                                    <Link key={o.id} to={`/purchase/orders/${o.id}`} className="mr-2 text-blue-600 hover:underline">
                                                        {o.code}
                                                    </Link>
                                                ))}
                                            </Info>
                                        )}
                                    </>
                                )}
                                {type !== 'requests' && (
                                    <Info label="Vendor">
                                        <Link to={`/purchase/vendors/${(d.vendor as { id: number }).id}`} className="text-blue-600 hover:underline">
                                            {(d.vendor as { name: string }).name}
                                        </Link>
                                    </Info>
                                )}
                                {type === 'orders' && (
                                    <>
                                        <Info label="Order Name">{d.name as string}</Info>
                                        <Info label="Order Date">{formatDate(d.order_date as string)}</Info>
                                        <Info label="Delivery Date">{formatDate(d.delivery_date as string)}</Info>
                                        <Info label="Buyer">{d.buyer as string}</Info>
                                        <Info label="Purchase Request">
                                            {d.request ? (
                                                <Link to={`/purchase/requests/${(d.request as { id: number }).id}`} className="text-blue-600 hover:underline">
                                                    {(d.request as { code: string }).code}
                                                </Link>
                                            ) : null}
                                        </Info>
                                        <Info label="Delivery">
                                            {d.can.manage && status === 2 ? (
                                                <Select value={String(d.delivery_status)} onChange={(e) => act({ action: 'delivery', delivery_status: Number(e.target.value) }, 'Delivery status updated.')} className="w-52">
                                                    {Object.entries(DELIVERY_STATUSES).map(([k, v]) => (
                                                        <option key={k} value={k}>
                                                            {v}
                                                        </option>
                                                    ))}
                                                </Select>
                                            ) : (
                                                DELIVERY_STATUSES[d.delivery_status as number]
                                            )}
                                        </Info>
                                        {(d.invoices as { id: number; invoice_number: string }[]).length > 0 && (
                                            <Info label="Invoices">
                                                {(d.invoices as { id: number; invoice_number: string }[]).map((i) => (
                                                    <Link key={i.id} to={`/purchase/invoices/${i.id}`} className="mr-2 text-blue-600 hover:underline">
                                                        {i.invoice_number}
                                                    </Link>
                                                ))}
                                            </Info>
                                        )}
                                    </>
                                )}
                                {type === 'invoices' && (
                                    <>
                                        <Info label="Vendor Invoice #">{d.vendor_invoice_number as string}</Info>
                                        <Info label="Invoice Date">{formatDate(d.invoice_date as string)}</Info>
                                        <Info label="Due Date">{formatDate(d.due_date as string)}</Info>
                                        <Info label="Purchase Order">
                                            {d.order ? (
                                                <Link to={`/purchase/orders/${(d.order as { id: number }).id}`} className="text-blue-600 hover:underline">
                                                    {(d.order as { code: string }).code}
                                                </Link>
                                            ) : null}
                                        </Info>
                                        <Info label="Transaction ID">{d.transaction_id as string}</Info>
                                    </>
                                )}
                            </div>
                            {typeof d.description === 'string' && d.description && <p className="whitespace-pre-wrap text-gray-700">{d.description}</p>}
                            <div className="-mx-4 overflow-x-auto">
                                <table className="table-perfex">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Item</th>
                                            <th className="text-right">Qty</th>
                                            <th className="text-right">Unit Price</th>
                                            <th className="text-right">Tax</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.items.map((it, i) => (
                                            <tr key={it.id}>
                                                <td>{i + 1}</td>
                                                <td>
                                                    <span className="font-medium">{it.description}</span>
                                                    {it.long_description && <span className="block text-xs text-gray-500">{it.long_description}</span>}
                                                </td>
                                                <td className="text-right">
                                                    {Number(it.qty)} {it.unit}
                                                </td>
                                                <td className="text-right">{money(it.unit_price, cur)}</td>
                                                <td className="text-right">{it.tax_rate ? `${it.tax_name ?? ''} ${Number(it.tax_rate)}%` : '—'}</td>
                                                <td className="text-right">{money(it.qty * it.unit_price, cur)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="ml-auto max-w-xs space-y-1">
                                <Total label="Sub Total" value={money(d.subtotal as number, cur)} />
                                {Number(d.discount_total) > 0 && <Total label="Discount" value={`-${money(d.discount_total as number, cur)}`} />}
                                <Total label="Tax" value={money(d.total_tax as number, cur)} />
                                {Number(d.shipping_fee) > 0 && <Total label="Shipping" value={money(d.shipping_fee as number, cur)} />}
                                <Total label="Total" value={money(d.total as number, cur)} strong />
                                {type === 'invoices' && (
                                    <>
                                        <Total label="Paid" value={money(d.amount_paid as number, cur)} />
                                        <Total label="Amount Due" value={money(d.amount_due as number, cur)} strong />
                                    </>
                                )}
                            </div>
                            {typeof d.vendor_note === 'string' && d.vendor_note && <Note title="Vendor Note" text={d.vendor_note} />}
                            {typeof d.terms === 'string' && d.terms && <Note title="Terms & Conditions" text={d.terms} />}
                            {typeof d.admin_note === 'string' && d.admin_note && <Note title="Admin Note" text={d.admin_note} />}
                        </div>
                    </div>

                    {type === 'invoices' && (
                        <div className="panel_s">
                            <div className="panel-body">
                                <h5 className="mb-2 font-semibold">Payments</h5>
                                <div className="-mx-4 overflow-x-auto">
                                    <table className="table-perfex">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Payment Mode</th>
                                                <th>Transaction ID</th>
                                                <th className="text-right">Amount</th>
                                                <th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(d.payments ?? []).map((p) => (
                                                <tr key={p.id}>
                                                    <td>{formatDate(p.date)}</td>
                                                    <td>{p.payment_mode}</td>
                                                    <td>{p.transaction_id}</td>
                                                    <td className="text-right">{money(p.amount, cur)}</td>
                                                    <td className="text-right">
                                                        {d.can.edit && (
                                                            <button
                                                                type="button"
                                                                onClick={() => confirm('Delete this payment?') && api.delete<{ data: Doc }>(`/purchase/invoices/${id}/payments/${p.id}`).then((r) => setData(r.data))}
                                                                className="text-gray-400 hover:text-red-600"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {(d.payments ?? []).length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center text-gray-500">
                                                        No payments yet.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {type !== 'invoices' && (
                        <div className="panel_s">
                            <div className="panel-body text-[13px]">
                                <h5 className="mb-2 font-semibold">Approval</h5>
                                {(d.approvals ?? []).length === 0 ? (
                                    <p className="text-gray-500">{status === 1 ? 'Not sent for approval yet.' : 'No approvers were needed.'}</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {(d.approvals ?? []).map((a) => (
                                            <li key={a.staff_id} className="flex items-start justify-between gap-2">
                                                <span>
                                                    {a.staff}
                                                    {a.note && <span className="block text-xs text-gray-500">{a.note}</span>}
                                                </span>
                                                <span className="text-right text-xs">
                                                    <StatusPill status={a.decision ? PURCHASE_STATUSES[a.decision] : { name: 'Waiting', color: '#64748b' }} />
                                                    {a.decided_at && <span className="block text-gray-400">{formatDateTime(a.decided_at)}</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                    {type === 'invoices' && <FilesPanelFor invoiceId={d.id} files={d.attachments ?? []} canUpload={d.can.edit} onChange={reload} />}
                </div>
            </div>

            {modal === 'reject' && <RejectModal onClose={() => setModal(null)} onReject={(note) => (setModal(null), act({ action: 'reject', note }, 'Rejected.'))} />}
            {modal === 'order' && <ToOrderModal onClose={() => setModal(null)} onPick={(vendorId) => (setModal(null), act({ action: 'to_order', vendor_id: vendorId }, 'Purchase order created.'))} />}
            {modal === 'payment' && (
                <PaymentModal
                    invoiceId={d.id}
                    due={d.amount_due as number}
                    onClose={() => setModal(null)}
                    onSaved={(doc) => {
                        setModal(null);
                        setData({ data: doc });
                        toast('Payment recorded.');
                    }}
                />
            )}
        </div>
    );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="font-medium text-gray-800">{children || '—'}</dd>
        </div>
    );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={`flex justify-between text-[13.5px] ${strong ? 'border-t border-gray-200 pt-1 font-semibold' : ''}`}>
            <span className={strong ? '' : 'text-gray-600'}>{label}</span>
            <span>{value}</span>
        </div>
    );
}

function Note({ title, text }: { title: string; text: string }) {
    return (
        <div>
            <p className="font-semibold">{title}:</p>
            <p className="whitespace-pre-wrap text-gray-600">{text}</p>
        </div>
    );
}

function RejectModal({ onClose, onReject }: { onClose: () => void; onReject: (note: string) => void }) {
    const [note, setNote] = useState('');

    return (
        <Modal
            open
            title="Reject"
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={() => onReject(note)}>
                        Reject
                    </Button>
                </>
            }
        >
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" />
        </Modal>
    );
}

function ToOrderModal({ onClose, onPick }: { onClose: () => void; onPick: (vendorId: number) => void }) {
    const { data } = useApi<{ data: { id: number; name: string }[] }>('/purchase/vendors/options');
    const [vendor, setVendor] = useState('');

    return (
        <Modal
            open
            title="Convert to Purchase Order"
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => onPick(Number(vendor))} disabled={!vendor}>
                        Create Order
                    </Button>
                </>
            }
        >
            <Field label="Vendor" required>
                <Select value={vendor} onChange={(e) => setVendor(e.target.value)}>
                    <option value="">Select vendor</option>
                    {(data?.data ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                            {v.name}
                        </option>
                    ))}
                </Select>
            </Field>
        </Modal>
    );
}

function PaymentModal({ invoiceId, due, onClose, onSaved }: { invoiceId: number; due: number; onClose: () => void; onSaved: (doc: Doc) => void }) {
    const { data: modes } = useApi<{ data: PaymentMode[] }>('/setup/payment-modes');
    const [form, setForm] = useState({ amount: String(due), date: todayIso(), payment_mode_id: '', transaction_id: '', note: '' });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        setError(null);
        try {
            const res = await api.post<{ data: Doc }>(`/purchase/invoices/${invoiceId}/payments`, { ...form, payment_mode_id: form.payment_mode_id || null });
            onSaved(res.data.data);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            title="Record Payment"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <ErrorNote message={error} />
                <Field label="Amount" required className="sm:col-span-2">
                    <Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label="Payment Date" required>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="Payment Mode">
                    <Select value={form.payment_mode_id} onChange={(e) => setForm({ ...form, payment_mode_id: e.target.value })}>
                        <option value="">—</option>
                        {(modes?.data ?? []).map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Transaction ID" className="sm:col-span-2">
                    <Input value={form.transaction_id} onChange={(e) => setForm({ ...form, transaction_id: e.target.value })} />
                </Field>
                <Field label="Note" className="sm:col-span-2">
                    <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
            </div>
        </Modal>
    );
}
