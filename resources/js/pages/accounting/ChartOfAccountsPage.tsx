import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, toIsoDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { accountLabel, REL_LABELS, useAccounts, type AccountRow, type AccountsReply } from './shared';

/** Perfex Accounting → Chart of Accounts, grouped by account type, with balances. */
export default function ChartOfAccountsPage() {
    const toast = useToast();
    const canCreate = usePermission('accounting.create');
    const canEdit = usePermission('accounting.edit');
    const canDelete = usePermission('accounting.delete');
    const { data, reload } = useAccounts();
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [editing, setEditing] = useState<AccountRow | 'new' | null>(null);

    const groups = useMemo(() => {
        if (!data) {
            return [];
        }
        const q = search.toLowerCase();
        const rows = data.data.filter((a) => (showInactive || a.active) && (!type || String(a.account_type_id) === type) && (!q || accountLabel(a).toLowerCase().includes(q)));

        return data.meta.types.map((t) => ({ type: t, rows: rows.filter((a) => a.account_type_id === t.id) })).filter((g) => g.rows.length);
    }, [data, search, type, showInactive]);

    async function remove(a: AccountRow) {
        if (!confirm(`Delete the account "${a.name}"?`)) {
            return;
        }
        try {
            await api.delete(`/accounting/accounts/${a.id}`);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Chart of Accounts</h4>
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => setEditing('new')}>
                        <Plus className="h-4 w-4" /> New Account
                    </Button>
                )}
                <Select value={type} onChange={(e) => setType(e.target.value)} className="w-56">
                    <option value="">All account types</option>
                    {data?.meta.types.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.name}
                        </option>
                    ))}
                </Select>
                <Checkbox label="Show inactive" checked={showInactive} onChange={setShowInactive} />
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts..." className="pl-9" />
                </div>
            </div>
            {!data ? (
                <Spinner />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Number</th>
                                    <th>Name</th>
                                    <th>Detail Type</th>
                                    <th className="text-right">Balance</th>
                                    <th />
                                </tr>
                            </thead>
                            {groups.map((g) => (
                                <tbody key={g.type.id}>
                                    <tr className="bg-gray-50">
                                        <td colSpan={5} className="font-semibold text-gray-700">
                                            {g.type.name}
                                        </td>
                                    </tr>
                                    {g.rows.map((a) => (
                                        <tr key={a.id} className={a.active ? '' : 'text-gray-400'}>
                                            <td>{a.number}</td>
                                            <td>
                                                <Link to={`/accounting/accounts/${a.id}`} className={`font-medium text-blue-600 hover:underline ${a.parent_id ? 'pl-5' : ''}`}>
                                                    {a.parent_id ? '↳ ' : ''}
                                                    {a.name}
                                                </Link>
                                                {!a.active && <span className="ml-2 text-xs">(inactive)</span>}
                                            </td>
                                            <td className="text-gray-600">{a.detail_type}</td>
                                            <td className={`text-right ${a.balance < 0 ? 'text-red-600' : ''}`}>{money(a.balance)}</td>
                                            <td className="whitespace-nowrap text-right">
                                                {canEdit && (
                                                    <button type="button" onClick={() => setEditing(a)} className="mr-2 text-gray-400 hover:text-gray-700" title="Edit">
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {canDelete && !a.has_transactions && (
                                                    <button type="button" onClick={() => remove(a)} className="text-gray-400 hover:text-red-600" title="Delete">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            ))}
                        </table>
                    </div>
                </div>
            )}
            {editing && data && (
                <AccountModal
                    account={editing === 'new' ? null : editing}
                    data={data}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

function AccountModal({ account, data, onClose, onSaved }: { account: AccountRow | null; data: AccountsReply; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState({
        name: account?.name ?? '',
        number: account?.number ?? '',
        account_type_id: String(account?.account_type_id ?? 14),
        account_detail_type_id: String(account?.account_detail_type_id ?? ''),
        parent_id: String(account?.parent_id ?? ''),
        description: account?.description ?? '',
        balance: account?.opening_balance != null ? String(account.opening_balance) : '',
        balance_as_of: account?.balance_as_of ?? toIsoDate(new Date()),
        bank_account: account?.bank_account ?? '',
        bank_name: account?.bank_name ?? '',
    });
    const [active, setActive] = useState(account?.active ?? true);
    const [newDetail, setNewDetail] = useState('');
    const [details, setDetails] = useState(data.meta.detail_types);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
    const typeDetails = details.filter((d) => String(d.account_type_id) === form.account_type_id);
    const parents = data.data.filter((a) => String(a.account_type_id) === form.account_type_id && a.id !== account?.id && !a.parent_id);
    const isBank = ['3', '16'].includes(form.account_type_id);

    async function addDetail() {
        try {
            const r = await api.post<{ data: { id: number; account_type_id: number; name: string } }>('/accounting/detail-types', { account_type_id: Number(form.account_type_id), name: newDetail });
            setDetails([...details, r.data.data]);
            setForm({ ...form, account_detail_type_id: String(r.data.data.id) });
            setNewDetail('');
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    async function save() {
        setSaving(true);
        setError(null);
        const body = {
            ...form,
            account_type_id: Number(form.account_type_id),
            account_detail_type_id: form.account_detail_type_id ? Number(form.account_detail_type_id) : null,
            parent_id: form.parent_id ? Number(form.parent_id) : null,
            balance: form.balance === '' ? null : Number(form.balance),
            balance_as_of: form.balance === '' ? null : form.balance_as_of,
            number: form.number || null,
            active,
        };
        try {
            await (account ? api.put(`/accounting/accounts/${account.id}`, body) : api.post('/accounting/accounts', body));
            onSaved();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            size="lg"
            title={account ? `Edit ${account.name}` : 'New Account'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!form.name.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <ErrorNote message={error} />
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Account Type" required>
                        <Select value={form.account_type_id} onChange={(e) => setForm({ ...form, account_type_id: e.target.value, account_detail_type_id: '', parent_id: '' })}>
                            {data.meta.types.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Detail Type">
                        <Select value={form.account_detail_type_id} onChange={set('account_detail_type_id')}>
                            <option value="">—</option>
                            {typeDetails.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </Select>
                        <div className="mt-1 flex gap-1">
                            <Input value={newDetail} onChange={(e) => setNewDetail(e.target.value)} placeholder="Add a detail type…" className="text-xs" />
                            <Button size="sm" variant="secondary" onClick={addDetail} disabled={!newDetail.trim()}>
                                Add
                            </Button>
                        </div>
                    </Field>
                    <Field label="Name" required>
                        <Input value={form.name} onChange={set('name')} />
                    </Field>
                    <Field label="Number">
                        <Input value={form.number} onChange={set('number')} />
                    </Field>
                    <Field label="Sub-account of">
                        <Select value={form.parent_id} onChange={set('parent_id')}>
                            <option value="">— (not a sub-account)</option>
                            {parents.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {accountLabel(p)}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Opening balance">
                            <Input type="number" step="any" value={form.balance} onChange={set('balance')} />
                        </Field>
                        <Field label="As of">
                            <Input type="date" value={form.balance_as_of} onChange={set('balance_as_of')} disabled={form.balance === ''} />
                        </Field>
                    </div>
                    {isBank && (
                        <>
                            <Field label="Bank name">
                                <Input value={form.bank_name} onChange={set('bank_name')} />
                            </Field>
                            <Field label="Bank account number">
                                <Input value={form.bank_account} onChange={set('bank_account')} />
                            </Field>
                        </>
                    )}
                </div>
                <Field label="Description">
                    <Textarea rows={2} value={form.description} onChange={set('description')} />
                </Field>
                <Checkbox label="Active" checked={active} onChange={setActive} />
            </div>
        </Modal>
    );
}

type History = { account: { id: number; name: string; number: string | null }; opening: number; closing: number; rows: { id: number; date: string; description: string | null; rel_type: string; rel_id: number | null; debit: number; credit: number; balance: number }[] };

/** Perfex account history: postings in a period with the running balance. */
export function AccountHistoryPage() {
    const { id } = useParams();
    const year = new Date().getFullYear();
    const [from, setFrom] = useState(`${year}-01-01`);
    const [to, setTo] = useState(toIsoDate(new Date()));
    const { data } = useApi<{ data: History }>(`/accounting/accounts/${id}/history`, { from, to });
    const h = data?.data;

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link to="/accounting/chart-of-accounts" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">{h ? accountLabel(h.account) : 'Account'}</h4>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            </div>
            {!h ? (
                <Spinner />
            ) : (
                <div className="panel_s overflow-x-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Description</th>
                                <th className="text-right">Debit</th>
                                <th className="text-right">Credit</th>
                                <th className="text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="bg-gray-50">
                                <td colSpan={5} className="font-medium">
                                    Beginning balance
                                </td>
                                <td className="text-right font-medium">{money(h.opening)}</td>
                            </tr>
                            {h.rows.map((r) => (
                                <tr key={r.id}>
                                    <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                                    <td>
                                        {r.rel_type === 'journal_entry' && r.rel_id ? (
                                            <Link to={`/accounting/journal-entries/${r.rel_id}`} className="text-blue-600 hover:underline">
                                                {REL_LABELS[r.rel_type]}
                                            </Link>
                                        ) : (
                                            REL_LABELS[r.rel_type] ?? r.rel_type
                                        )}
                                    </td>
                                    <td>{r.description}</td>
                                    <td className="text-right">{r.debit ? money(r.debit) : ''}</td>
                                    <td className="text-right">{r.credit ? money(r.credit) : ''}</td>
                                    <td className="text-right">{money(r.balance)}</td>
                                </tr>
                            ))}
                            {h.rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center text-gray-500">
                                        No transactions in this period.
                                    </td>
                                </tr>
                            )}
                            <tr className="bg-gray-50 font-semibold">
                                <td colSpan={5}>Ending balance</td>
                                <td className="text-right">{money(h.closing)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
