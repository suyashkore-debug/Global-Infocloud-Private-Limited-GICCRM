import { useMemo, useState } from 'react';
import { AtSign, IdCard, KeyRound, Lock, Mail, Pencil, Phone, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { clearStaffCache } from '../../hooks/useStaff';
import { useAuth } from '../../auth/AuthContext';
import { Avatar, Button, Checkbox, ErrorNote, Field, FormSection, IconInput, Modal, Spinner, Tabs } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { confirmDialog } from '../../components/ui/Dialogs';

type Member = {
    id: number;
    source: 'crm' | 'hrms';
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
    username: string | null;
    mobile: string | null;
    employee_code: string | null;
    photo_url: string | null;
    is_company_admin: boolean;
    is_active: boolean;
    locked: boolean;
    last_login_at: string | null;
    hrms_synced_at: string | null;
};

type Filter = 'all' | 'crm' | 'hrms' | 'inactive';

/**
 * Setup → Staff → Staff Members: every account of the company. Accounts created here live only
 * in the CRM; HRMS accounts are copied from HRMS and changed there.
 */
export default function StaffMembersSetup() {
    const toast = useToast();
    const { data, reload } = useApi<{ data: Member[] }>('/staff-members');
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Member | 'new' | null>(null);
    const [syncing, setSyncing] = useState(false);

    const members = data?.data;
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (members ?? []).filter(
            (m) =>
                (filter === 'all' || (filter === 'inactive' ? !m.is_active : m.source === filter && m.is_active)) &&
                (!q || [m.full_name, m.email, m.username, m.employee_code, m.mobile].some((v) => v?.toLowerCase().includes(q))),
        );
    }, [members, filter, search]);
    const count = (f: Filter) => (members ?? []).filter((m) => (f === 'all' ? true : f === 'inactive' ? !m.is_active : m.source === f && m.is_active)).length;

    const changed = () => {
        clearStaffCache();
        reload();
    };

    async function sync() {
        setSyncing(true);
        try {
            const res = await api.post<{ message: string }>('/staff-members/sync');
            toast(res.data.message);
            changed();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSyncing(false);
        }
    }

    async function remove(m: Member) {
        if (!(await confirmDialog(`Delete ${m.full_name}? They will not be able to log in any more.`))) {
            return;
        }
        try {
            await api.delete(`/staff-members/${m.id}`);
            toast('Staff member deleted.');
            changed();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="panel_s">
            <div className="panel-body space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h5 className="text-[15px] font-semibold">Staff Members</h5>
                        <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
                            Staff you add here get a CRM login only (they are not added to HRMS). HRMS employees can log in with their HRMS password and are copied here automatically; change them in HRMS.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={sync} loading={syncing} title="Copy new and changed HRMS employees now">
                            <RefreshCw className="h-4 w-4" /> Sync from HRMS
                        </Button>
                        <Button onClick={() => setEditing('new')}>
                            <Plus className="h-4 w-4" /> New Staff Member
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Tabs
                        tabs={[
                            { id: 'all', label: 'All', count: count('all') },
                            { id: 'crm', label: 'CRM', count: count('crm') },
                            { id: 'hrms', label: 'HRMS', count: count('hrms') },
                            { id: 'inactive', label: 'Inactive', count: count('inactive') },
                        ]}
                        active={filter}
                        onChange={setFilter}
                    />
                    <div className="w-full sm:w-64">
                        <IconInput icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." />
                    </div>
                </div>

                {!members ? (
                    <Spinner />
                ) : (
                    <div className="table-scroll -mx-4 overflow-x-auto sm:mx-0">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Username</th>
                                    <th>Phone</th>
                                    <th>Account</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Last login</th>
                                    <th data-nosort />
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((m) => (
                                    <tr key={m.id}>
                                        <td>
                                            <span className="flex items-center gap-2.5">
                                                <Avatar id={m.id} name={m.full_name} photo={m.photo_url} size="sm" />
                                                <span>
                                                    <span className="block font-semibold text-slate-800">{m.full_name}</span>
                                                    {m.employee_code && <span className="block text-[11.5px] text-slate-400">{m.employee_code}</span>}
                                                </span>
                                            </span>
                                        </td>
                                        <td>{m.email}</td>
                                        <td>{m.username}</td>
                                        <td>{m.mobile}</td>
                                        <td>
                                            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${m.source === 'crm' ? 'bg-accent-50 text-accent' : 'bg-brand-50 text-brand'}`}>{m.source === 'crm' ? 'CRM' : 'HRMS'}</span>
                                        </td>
                                        <td>{m.is_company_admin ? <span className="inline-flex items-center gap-1 font-semibold text-brand"><ShieldCheck className="h-3.5 w-3.5" /> Admin</span> : 'Staff'}</td>
                                        <td>
                                            {m.locked ? (
                                                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber-700"><Lock className="h-3.5 w-3.5" /> Locked</span>
                                            ) : (
                                                <span className={`text-[12.5px] font-semibold ${m.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>{m.is_active ? 'Active' : 'Inactive'}</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap text-[12.5px]">{m.last_login_at ? formatDateTime(m.last_login_at) : '—'}</td>
                                        <td className="whitespace-nowrap text-right">
                                            {m.source === 'crm' ? (
                                                <span className="inline-flex gap-1">
                                                    <button type="button" onClick={() => setEditing(m)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand" title="Edit">
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button type="button" onClick={() => remove(m)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </span>
                                            ) : (
                                                <span className="text-[11.5px] text-slate-400">Managed in HRMS</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {shown.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="py-8 text-center text-sm text-slate-400">
                                            No staff members found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {editing && (
                <StaffForm
                    member={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        changed();
                    }}
                />
            )}
        </div>
    );
}

function StaffForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const { user } = useAuth();
    const [form, setForm] = useState({
        first_name: member?.first_name ?? '',
        last_name: member?.last_name ?? '',
        email: member?.email ?? '',
        username: member?.username ?? '',
        mobile: member?.mobile ?? '',
        employee_code: member?.employee_code ?? '',
        password: '',
        is_company_admin: member?.is_company_admin ?? false,
        is_active: member?.is_active ?? true,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
    const self = member?.id === user?.id;

    async function save() {
        setSaving(true);
        setErrors({});
        setError(null);
        try {
            const payload = { ...form, password: form.password || undefined, username: form.username || null };
            if (member) {
                await api.put(`/staff-members/${member.id}`, payload);
            } else {
                await api.post('/staff-members', payload);
            }
            toast(member ? 'Staff member updated.' : 'Staff member created. They can log in now.');
            onSaved();
        } catch (e) {
            const data = (e as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data;
            if (data?.errors) {
                setErrors(Object.fromEntries(Object.entries(data.errors).map(([k, v]) => [k, v[0]])));
            } else {
                setError(errorMessage(e));
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            size="lg"
            title={member ? `Edit ${member.full_name}` : 'New Staff Member'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving}>
                        {member ? 'Save changes' : 'Create staff member'}
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                <ErrorNote message={error} />
                <FormSection icon={UserRound} title="Profile" hint="Who this person is.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="First Name" required error={errors.first_name}>
                            <IconInput icon={UserRound} value={form.first_name} onChange={set('first_name')} autoFocus />
                        </Field>
                        <Field label="Last Name" error={errors.last_name}>
                            <IconInput icon={UserRound} value={form.last_name} onChange={set('last_name')} />
                        </Field>
                        <Field label="Email" required error={errors.email}>
                            <IconInput icon={Mail} type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" />
                        </Field>
                        <Field label="Phone" error={errors.mobile}>
                            <IconInput icon={Phone} value={form.mobile} onChange={set('mobile')} placeholder="98765 43210" />
                        </Field>
                        <Field label="Employee Code" error={errors.employee_code}>
                            <IconInput icon={IdCard} value={form.employee_code} onChange={set('employee_code')} />
                        </Field>
                    </div>
                </FormSection>

                <FormSection icon={KeyRound} title="Login" hint="They log in with the username or the e-mail, and this password.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Username" error={errors.username} hint="Optional. Letters, numbers, . _ - @">
                            <IconInput icon={AtSign} value={form.username} onChange={set('username')} placeholder="e.g. ravi.patil" />
                        </Field>
                        <Field label={member ? 'New Password' : 'Password'} required={!member} error={errors.password} hint={member ? 'Leave empty to keep the current password.' : 'At least 8 characters.'}>
                            <IconInput icon={KeyRound} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                        </Field>
                    </div>
                    <div className="mt-4 space-y-2">
                        <Checkbox label="Administrator (full access to everything, like a company admin)" checked={form.is_company_admin} onChange={(v) => setForm({ ...form, is_company_admin: v })} />
                        <Checkbox label="Active (can log in)" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} disabled={self} />
                        {!form.is_company_admin && <p className="text-xs text-slate-500">What a non-admin can see and do is set in Setup → Staff → Staff Permissions.</p>}
                    </div>
                </FormSection>
            </div>
        </Modal>
    );
}
