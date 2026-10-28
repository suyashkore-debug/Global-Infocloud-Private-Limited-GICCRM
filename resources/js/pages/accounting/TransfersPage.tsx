import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, todayIso } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { accountLabel, useAccounts } from './shared';

/** Perfex Accounting → Transfer: move money between two accounts (e.g. bank to cash). */
export default function TransfersPage() {
    const canCreate = usePermission('accounting.create');
    const canDelete = usePermission('accounting.delete');
    const { data, reload } = useApi<{ data: { id: number; date: string; from: string; to: string; amount: number; description: string | null }[] }>('/accounting/transfers');
    const [open, setOpen] = useState(false);

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="page-title">Transfers</h4>
                {canCreate && (
                    <Button onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4" /> New Transfer
                    </Button>
                )}
            </div>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No transfers yet" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>From</th>
                                <th>To</th>
                                <th className="text-right">Amount</th>
                                <th>Description</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((t) => (
                                <tr key={t.id}>
                                    <td>{formatDate(t.date)}</td>
                                    <td>{t.from}</td>
                                    <td>{t.to}</td>
                                    <td className="text-right">{money(t.amount)}</td>
                                    <td>{t.description}</td>
                                    <td className="text-right">
                                        {canDelete && (
                                            <button type="button" onClick={() => confirm('Delete this transfer?') && api.delete(`/accounting/transfers/${t.id}`).then(reload)} className="text-gray-400 hover:text-red-600" title="Delete">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {open && <TransferModal onClose={() => setOpen(false)} onSaved={() => (setOpen(false), reload())} />}
        </div>
    );
}

function TransferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const { data } = useAccounts();
    const [form, setForm] = useState({ from_account_id: '', to_account_id: '', amount: '', date: todayIso(), description: '' });
    const [error, setError] = useState<string | null>(null);
    const options = (data?.data ?? []).filter((a) => a.active);

    async function save() {
        setError(null);
        try {
            await api.post('/accounting/transfers', { ...form, from_account_id: Number(form.from_account_id), to_account_id: Number(form.to_account_id), amount: Number(form.amount) });
            onSaved();
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    const select = (key: 'from_account_id' | 'to_account_id') => (
        <Select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
            <option value="">Select account</option>
            {options.map((a) => (
                <option key={a.id} value={a.id}>
                    {accountLabel(a)} ({money(a.balance)})
                </option>
            ))}
        </Select>
    );

    return (
        <Modal
            open
            title="New Transfer"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={!form.from_account_id || !form.to_account_id || !form.amount}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <ErrorNote message={error} />
                <Field label="Transfer funds from" required className="sm:col-span-2">
                    {select('from_account_id')}
                </Field>
                <Field label="Transfer funds to" required className="sm:col-span-2">
                    {select('to_account_id')}
                </Field>
                <Field label="Amount" required>
                    <Input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label="Date" required>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                    <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
            </div>
        </Modal>
    );
}
