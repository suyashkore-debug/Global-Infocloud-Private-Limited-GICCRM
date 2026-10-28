import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, todayIso } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, ErrorNote, Field, Input, Modal, Pagination, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { accountLabel, useAccounts } from './shared';

type Entry = { id: number; number: number; journal_date: string; reference: string | null; description: string | null; amount: number; lines: { account_id: number; account: string | null; debit: number; credit: number; description: string | null }[] };

/** Perfex Accounting → Journal Entry list. */
export default function JournalEntriesPage() {
    const navigate = useNavigate();
    const canCreate = usePermission('accounting.create');
    const [page, setPage] = useState(1);
    const { data } = useApi<{ data: (Omit<Entry, 'lines'> & { lines_count: number; created_by: string | null })[]; meta: { current_page: number; last_page: number; total: number } }>('/accounting/journal-entries', { page });
    const { id } = useParams();
    const [open, setOpen] = useState<number | null>(id ? Number(id) : null);

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="page-title">Journal Entries</h4>
                {canCreate && (
                    <Button onClick={() => navigate('/accounting/journal-entries/new')}>
                        <Plus className="h-4 w-4" /> New Journal Entry
                    </Button>
                )}
            </div>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No journal entries yet" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Date</th>
                                <th>Reference</th>
                                <th>Description</th>
                                <th className="text-right">Amount</th>
                                <th>Added by</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((j) => (
                                <tr key={j.id} className="cursor-pointer" onClick={() => setOpen(j.id)}>
                                    <td className="font-medium text-blue-600">{j.number}</td>
                                    <td>{formatDate(j.journal_date)}</td>
                                    <td>{j.reference}</td>
                                    <td className="max-w-md truncate">{j.description}</td>
                                    <td className="text-right">{money(j.amount)}</td>
                                    <td>{j.created_by}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}
            {open && <EntryModal id={open} onClose={() => setOpen(null)} />}
        </div>
    );
}

function EntryModal({ id, onClose }: { id: number; onClose: () => void }) {
    const navigate = useNavigate();
    const { data } = useApi<{ data: Entry }>(`/accounting/journal-entries/${id}`);
    const canEdit = usePermission('accounting.edit');
    const canDelete = usePermission('accounting.delete');
    const toast = useToast();
    const e = data?.data;

    async function remove() {
        if (!confirm('Delete this journal entry?')) {
            return;
        }
        await api.delete(`/accounting/journal-entries/${id}`);
        toast('Journal entry deleted.');
        window.location.reload();
    }

    return (
        <Modal
            open
            size="lg"
            title={e ? `Journal Entry #${e.number}` : 'Journal Entry'}
            onClose={onClose}
            footer={
                e && (
                    <>
                        {canDelete && (
                            <Button variant="danger" onClick={remove}>
                                <Trash2 className="h-4 w-4" /> Delete
                            </Button>
                        )}
                        {canEdit && (
                            <Button onClick={() => navigate(`/accounting/journal-entries/${id}/edit`)}>
                                <Pencil className="h-4 w-4" /> Edit
                            </Button>
                        )}
                    </>
                )
            }
        >
            {!e ? <Spinner /> : <EntryTable entry={e} />}
        </Modal>
    );
}

export function EntryTable({ entry: e }: { entry: Entry }) {
    return (
        <div className="space-y-3 text-[13.5px]">
            <p className="text-gray-600">
                {formatDate(e.journal_date)} {e.reference && `· Ref: ${e.reference}`}
            </p>
            {e.description && <p className="whitespace-pre-wrap">{e.description}</p>}
            <table className="table-perfex">
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Description</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                    </tr>
                </thead>
                <tbody>
                    {e.lines.map((l, i) => (
                        <tr key={i}>
                            <td>{l.account}</td>
                            <td className="text-gray-600">{l.description}</td>
                            <td className="text-right">{l.debit ? money(l.debit) : ''}</td>
                            <td className="text-right">{l.credit ? money(l.credit) : ''}</td>
                        </tr>
                    ))}
                    <tr className="font-semibold">
                        <td colSpan={2}>Total</td>
                        <td className="text-right">{money(e.amount)}</td>
                        <td className="text-right">{money(e.amount)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

type Line = { account_id: string; debit: string; credit: string; description: string };
const blankLine = (): Line => ({ account_id: '', debit: '', credit: '', description: '' });

/** New / edit journal entry: lines with debit or credit; saving needs equal totals. */
export function JournalEntryFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { data: accounts } = useAccounts();
    const [form, setForm] = useState({ journal_date: todayIso(), reference: '', description: '' });
    const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!id) {
            return;
        }
        api.get<{ data: Entry }>(`/accounting/journal-entries/${id}`).then(({ data }) => {
            setForm({ journal_date: data.data.journal_date, reference: data.data.reference ?? '', description: data.data.description ?? '' });
            setLines(data.data.lines.map((l) => ({ account_id: String(l.account_id), debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '', description: l.description ?? '' })));
        });
    }, [id]);

    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
    const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, li) => (li === i ? { ...l, ...patch } : l)));

    async function save() {
        setSaving(true);
        setError(null);
        const body = { ...form, lines: lines.filter((l) => l.account_id && (Number(l.debit) || Number(l.credit))).map((l) => ({ account_id: Number(l.account_id), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || null })) };
        try {
            await (id ? api.put(`/accounting/journal-entries/${id}`, body) : api.post('/accounting/journal-entries', body));
            toast('Journal entry saved.');
            navigate('/accounting/journal-entries');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center gap-2">
                <Link to="/accounting/journal-entries" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title">{id ? 'Edit Journal Entry' : 'New Journal Entry'}</h4>
            </div>
            <ErrorNote message={error} />
            <div className="panel_s">
                <div className="panel-body space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Journal date" required>
                            <Input type="date" value={form.journal_date} onChange={(e) => setForm({ ...form, journal_date: e.target.value })} />
                        </Field>
                        <Field label="Reference">
                            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                        </Field>
                    </div>
                    <Field label="Description">
                        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </Field>
                    <div className="-mx-4 table-scroll overflow-x-auto px-4">
                        <table className="table-perfex min-w-[700px]">
                            <thead>
                                <tr>
                                    <th>Account</th>
                                    <th className="w-36 text-right">Debit</th>
                                    <th className="w-36 text-right">Credit</th>
                                    <th>Description</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={i}>
                                        <td>
                                            <Select value={l.account_id} onChange={(e) => update(i, { account_id: e.target.value })}>
                                                <option value="">Select account</option>
                                                {accounts?.meta.types.map((t) => (
                                                    <optgroup key={t.id} label={t.name}>
                                                        {accounts.data
                                                            .filter((a) => a.account_type_id === t.id && a.active)
                                                            .map((a) => (
                                                                <option key={a.id} value={a.id}>
                                                                    {accountLabel(a)}
                                                                </option>
                                                            ))}
                                                    </optgroup>
                                                ))}
                                            </Select>
                                        </td>
                                        <td>
                                            <Input type="number" step="any" min={0} value={l.debit} onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className="text-right" />
                                        </td>
                                        <td>
                                            <Input type="number" step="any" min={0} value={l.credit} onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className="text-right" />
                                        </td>
                                        <td>
                                            <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                                        </td>
                                        <td>
                                            <button type="button" onClick={() => setLines(lines.length > 2 ? lines.filter((_, li) => li !== i) : lines)} className="text-gray-400 hover:text-red-600" title="Remove">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="font-semibold">
                                    <td>
                                        <button type="button" onClick={() => setLines([...lines, blankLine()])} className="text-[13px] font-medium text-blue-600 hover:underline">
                                            + Add line
                                        </button>
                                    </td>
                                    <td className="text-right">{money(debit)}</td>
                                    <td className="text-right">{money(credit)}</td>
                                    <td colSpan={2} className={balanced ? 'text-green-700' : 'text-red-600'}>
                                        {balanced ? 'Balanced' : `Difference ${money(Math.abs(debit - credit))}`}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={save} loading={saving} disabled={!balanced}>
                            Save
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
