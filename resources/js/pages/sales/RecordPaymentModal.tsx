import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { money } from '../../lib/sales';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Invoice, PaymentMode } from '../../types';

/** Perfex "Record Payment for INV-…". */
export default function RecordPaymentModal({ open, invoice, onClose, onSaved }: { open: boolean; invoice: Invoice; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const [modes, setModes] = useState<PaymentMode[]>([]);
    const [form, setForm] = useState({ amount: '', date: todayIso(), payment_mode_id: '', payment_method: '', transaction_id: '', note: '' });
    const [noEmail, setNoEmail] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }
        api.get<{ data: PaymentMode[] }>('/setup/payment-modes').then((r) => {
            const allowed = r.data.data.filter((m) => m.active && invoice.allowed_payment_modes.includes(m.id));
            setModes(allowed);
            setForm({ amount: String(invoice.amount_due ?? invoice.total), date: todayIso(), payment_mode_id: String(allowed[0]?.id ?? ''), payment_method: '', transaction_id: '', note: '' });
        });
        setErrors({});
        setError(null);
    }, [open, invoice]);

    async function save() {
        setSaving(true);
        try {
            await api.post(`/invoices/${invoice.id}/payments`, { ...form, payment_mode_id: form.payment_mode_id ? Number(form.payment_mode_id) : null, do_not_send_email: noEmail });
            toast('Payment recorded.');
            onSaved();
        } catch (e) {
            setErrors(fieldErrors(e));
            setError(Object.keys(fieldErrors(e)).length ? null : errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Record Payment for ${invoice.formatted_number}`}
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
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <ErrorNote message={error} />
                </div>
                <Field label="Amount Received" required error={errors.amount} hint={`Amount due: ${money(invoice.amount_due, invoice.currency)}`}>
                    <Input type="number" step="any" min={0} value={form.amount} onChange={set('amount')} />
                </Field>
                <Field label="Payment Date" required error={errors.date}>
                    <Input type="date" value={form.date} onChange={set('date')} />
                </Field>
                <Field label="Payment Mode" error={errors.payment_mode_id}>
                    <Select value={form.payment_mode_id} onChange={set('payment_mode_id')}>
                        <option value="">—</option>
                        {modes.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Payment Method" error={errors.payment_method}>
                    <Input value={form.payment_method} onChange={set('payment_method')} />
                </Field>
                <Field label="Transaction ID" error={errors.transaction_id} className="sm:col-span-2">
                    <Input value={form.transaction_id} onChange={set('transaction_id')} />
                </Field>
                <Field label="Leave a note" error={errors.note} className="sm:col-span-2">
                    <Textarea rows={3} value={form.note} onChange={set('note')} />
                </Field>
                <div className="sm:col-span-2">
                    <Checkbox label="Do not send invoice payment recorded email to customer contacts" checked={noEmail} onChange={setNoEmail} />
                </div>
            </div>
        </Modal>
    );
}
