import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, FileDown, Pencil } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate, todayIso } from '../../lib/format';
import { CREDIT_NOTE_STATUSES, money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { Button, ErrorNote, Field, Input, Menu, MenuItem, Modal, Select, Spinner, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import DocumentPreview from '../../components/sales/DocumentPreview';
import type { CreditNote, PaymentMode } from '../../types';
import { openPdf } from './InvoiceViewPage';
import SendEmailButton from '../../components/email/SendEmailButton';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

export default function CreditNoteViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { data, error, setData, reload } = useApi<{ data: CreditNote }>(`/credit-notes/${id}`);
    const [tab, setTab] = useState<'note' | 'invoices' | 'refunds'>('note');
    const [applyOpen, setApplyOpen] = useState(false);
    const [refundOpen, setRefundOpen] = useState(false);
    const note = data?.data;
    usePageCrumb(note?.formatted_number);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!note) {
        return <Spinner />;
    }

    async function action(name: 'void' | 'unvoid') {
        try {
            const { data: result } = await api.post<{ data: CreditNote }>(`/credit-notes/${note!.id}/action`, { action: name });
            setData(result);
            toast(name === 'void' ? 'Credit note marked as void.' : 'Credit note reopened.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm(`Delete credit note ${note!.formatted_number}?`)) {
            return;
        }
        try {
            await api.delete(`/credit-notes/${note!.id}`);
            toast('Credit note deleted.');
            navigate('/credit-notes');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function removeLine(url: string, message: string) {
        if (!confirm('Are you sure?')) {
            return;
        }
        try {
            await api.delete(url);
            toast(message);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const fileName = `${note.formatted_number.replace(/[/\\]/g, '-')}.pdf`;
    const open = note.status === 1;

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-2 flex items-center gap-2">
                    {note.formatted_number} <StatusBadge option={optionById(CREDIT_NOTE_STATUSES, note.status)} />
                </h4>
                <span className="text-[13px] text-gray-600">Remaining: {money(note.remaining_credits, note.currency)}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                    {note.can.update && (
                        <Button variant="secondary" onClick={() => navigate(`/credit-notes/${note.id}/edit`)}>
                            <Pencil className="h-4 w-4" /> Edit
                        </Button>
                    )}
                    <SendEmailButton type="credit-notes" id={note.id} onSent={reload} />
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                <FileDown className="h-4 w-4" /> PDF <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                <MenuItem onClick={() => (close(), openPdf(`/credit-notes/${note.id}/pdf`, fileName, false))}>View PDF</MenuItem>
                                <MenuItem onClick={() => (close(), openPdf(`/credit-notes/${note.id}/pdf`, fileName, true))}>Download</MenuItem>
                            </>
                        )}
                    </Menu>
                    {open && note.can.update && note.remaining_credits > 0 && (
                        <>
                            <Button onClick={() => setApplyOpen(true)}>Apply to Invoice</Button>
                            <Button variant="secondary" onClick={() => setRefundOpen(true)}>
                                Refund
                            </Button>
                        </>
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
                                {note.can.update && note.status !== 3 && <MenuItem onClick={() => (close(), action('void'))}>Mark as Void</MenuItem>}
                                {note.can.update && note.status === 3 && <MenuItem onClick={() => (close(), action('unvoid'))}>Mark as Open</MenuItem>}
                                {note.can.delete && (
                                    <MenuItem danger onClick={() => (close(), remove())}>
                                        Delete
                                    </MenuItem>
                                )}
                            </>
                        )}
                    </Menu>
                </div>
            </div>

            <Tabs
                tabs={[
                    { id: 'note', label: 'Credit Note' },
                    { id: 'invoices', label: 'Invoices Credited', count: note.applied_credits?.length ?? 0 },
                    { id: 'refunds', label: 'Refunds', count: note.refunds?.length ?? 0 },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'note' && (
                <DocumentPreview
                    document={note}
                    customFields={{ to: 'credit_note', id: note.id }}
                    info={[
                        ['Credit Note Date', formatDate(note.date)],
                        ['Reference #', note.reference_no],
                        ['Project', note.project?.name],
                    ]}
                    extraTotals={[['Remaining Amount', money(note.remaining_credits, note.currency), true]]}
                />
            )}

            {tab === 'invoices' && (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Date</th>
                                <th className="text-right">Amount Credited</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {(note.applied_credits ?? []).map((c) => (
                                <tr key={c.id}>
                                    <td>{c.invoice && <Link to={`/invoices/${c.invoice.id}`}>{c.invoice.formatted_number}</Link>}</td>
                                    <td>{formatDate(c.date)}</td>
                                    <td className="text-right">{money(c.amount, note.currency)}</td>
                                    <td className="text-right">
                                        {note.can.update && (
                                            <button type="button" onClick={() => removeLine(`/applied-credits/${c.id}`, 'Applied credit removed.')} className="text-xs text-red-600 hover:underline">
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(note.applied_credits ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center text-gray-500">
                                        No credits applied yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'refunds' && (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Refunded On</th>
                                <th>Payment Mode</th>
                                <th>Note</th>
                                <th className="text-right">Amount</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {(note.refunds ?? []).map((r) => (
                                <tr key={r.id}>
                                    <td>{formatDate(r.refunded_on)}</td>
                                    <td>{r.payment_mode}</td>
                                    <td>{r.note}</td>
                                    <td className="text-right">{money(r.amount, note.currency)}</td>
                                    <td className="text-right">
                                        {note.can.update && (
                                            <button type="button" onClick={() => removeLine(`/credit-note-refunds/${r.id}`, 'Refund deleted.')} className="text-xs text-red-600 hover:underline">
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(note.refunds ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center text-gray-500">
                                        No refunds.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <ApplyCreditsModal open={applyOpen} note={note} onClose={() => setApplyOpen(false)} onDone={(n) => (setApplyOpen(false), setData({ data: n }))} />
            <RefundModal open={refundOpen} note={note} onClose={() => setRefundOpen(false)} onDone={(n) => (setRefundOpen(false), setData({ data: n }))} />
        </div>
    );
}

interface Creditable {
    id: number;
    formatted_number: string;
    date: string;
    total: string;
    amount_due: number;
}

/** Perfex "Apply credits from CN-… ": one amount per open invoice of the customer. */
function ApplyCreditsModal({ open, note, onClose, onDone }: { open: boolean; note: CreditNote; onClose: () => void; onDone: (note: CreditNote) => void }) {
    const toast = useToast();
    const [invoices, setInvoices] = useState<Creditable[] | null>(null);
    const [amounts, setAmounts] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }
        setInvoices(null);
        setAmounts({});
        api.get<{ data: Creditable[] }>(`/credit-notes/${note.id}/creditable-invoices`).then((r) => setInvoices(r.data.data));
    }, [open, note.id]);

    const total = Object.values(amounts).reduce((s, v) => s + Number(v || 0), 0);

    async function save() {
        const credits = Object.entries(amounts)
            .filter(([, v]) => Number(v) > 0)
            .map(([invoice_id, amount]) => ({ invoice_id: Number(invoice_id), amount: Number(amount) }));
        if (!credits.length) {
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post<{ data: CreditNote }>(`/credit-notes/${note.id}/apply`, { credits });
            toast('Credits applied.');
            onDone(data.data);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Apply credits from ${note.formatted_number}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save} loading={saving} disabled={total <= 0 || total > note.remaining_credits}>
                        Apply
                    </Button>
                </>
            }
        >
            {!invoices ? (
                <Spinner />
            ) : invoices.length === 0 ? (
                <p className="text-gray-500">This customer has no unpaid invoices.</p>
            ) : (
                <>
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Date</th>
                                <th className="text-right">Amount Due</th>
                                <th className="w-36">Amount to Credit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((i) => (
                                <tr key={i.id}>
                                    <td>{i.formatted_number}</td>
                                    <td>{formatDate(i.date)}</td>
                                    <td className="text-right">{money(i.amount_due, note.currency)}</td>
                                    <td>
                                        <Input type="number" min={0} max={i.amount_due} step="any" value={amounts[i.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [i.id]: e.target.value })} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className={`mt-3 text-right text-[13.5px] ${total > note.remaining_credits ? 'text-red-600' : 'text-gray-600'}`}>
                        Amount to credit: {money(total, note.currency)} · Remaining credits: {money(note.remaining_credits, note.currency)}
                    </p>
                </>
            )}
        </Modal>
    );
}

function RefundModal({ open, note, onClose, onDone }: { open: boolean; note: CreditNote; onClose: () => void; onDone: (note: CreditNote) => void }) {
    const toast = useToast();
    const [modes, setModes] = useState<PaymentMode[]>([]);
    const [form, setForm] = useState({ amount: '', refunded_on: todayIso(), payment_mode_id: '', note: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setForm({ amount: String(note.remaining_credits), refunded_on: todayIso(), payment_mode_id: '', note: '' });
            setErrors({});
            api.get<{ data: PaymentMode[] }>('/setup/payment-modes').then((r) => setModes(r.data.data.filter((m) => m.active)));
        }
    }, [open, note.remaining_credits]);

    async function save() {
        setSaving(true);
        try {
            const { data } = await api.post<{ data: CreditNote }>(`/credit-notes/${note.id}/refunds`, { ...form, payment_mode_id: form.payment_mode_id ? Number(form.payment_mode_id) : null });
            toast('Refund recorded.');
            onDone(data.data);
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="sm"
            title="Refund"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="Amount" required error={errors.amount}>
                    <Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label="Refunded On" required error={errors.refunded_on}>
                    <Input type="date" value={form.refunded_on} onChange={(e) => setForm({ ...form, refunded_on: e.target.value })} />
                </Field>
                <Field label="Payment Mode">
                    <Select value={form.payment_mode_id} onChange={(e) => setForm({ ...form, payment_mode_id: e.target.value })}>
                        <option value="">—</option>
                        {modes.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Note">
                    <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
            </div>
        </Modal>
    );
}
