import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { Avatar, Button, Input, Select, Spinner } from '../components/ui';
import { useToast } from '../components/ui/Toast';

interface StaffPermissions {
    id: number;
    full_name: string;
    email: string | null;
    is_admin: boolean;
    permissions: string[];
}

const CAPABILITIES = ['view_own', 'view', 'create', 'edit', 'delete', 'view_all_templates'] as const;
const CAP_LABELS: Record<string, string> = { view_own: 'View (Own)', view: 'View (Global)', create: 'Create', edit: 'Edit', delete: 'Delete', view_all_templates: 'All templates' };

/** Perfex names of the permission features, in the menu's order. */
const FEATURES: Record<string, { label: string; hint?: string }> = {
    customers: { label: 'Customers' },
    proposals: { label: 'Proposals', hint: 'Own = created by or assigned to them' },
    estimates: { label: 'Estimates', hint: 'Own = created by them or they are the sale agent' },
    invoices: { label: 'Invoices', hint: 'Own = created by them or they are the sale agent' },
    payments: { label: 'Payments' },
    credit_notes: { label: 'Credit Notes' },
    items: { label: 'Items' },
    expenses: { label: 'Expenses', hint: 'Own = created by them' },
    contracts: { label: 'Contracts', hint: 'Own = created by them' },
    projects: { label: 'Projects', hint: 'Without View, staff see only projects they are members of' },
    tasks: { label: 'Tasks', hint: 'Without View, staff see only tasks they are part of' },
    tickets: { label: 'Support / Tickets', hint: 'Without View, staff see tickets of their departments and tickets assigned to them' },
    leads: { label: 'Leads', hint: 'Without View, staff see leads assigned to / created by them and public leads' },
    estimate_request: { label: 'Estimate Request', hint: 'Own = requests assigned to them' },
    knowledge_base: { label: 'Knowledge Base' },
    goals: { label: 'Goals' },
    surveys: { label: 'Surveys' },
    reports: { label: 'Reports' },
};

/**
 * Setup → Staff Permissions, like Perfex's staff member Permissions tab: pick a staff member,
 * then tick what they may do per module. Company admins (from HRMS) have everything.
 */
export default function SettingsPage() {
    const { user } = useAuth();
    const toast = useToast();
    const { data, loading, reload } = useApi<{ data: StaffPermissions[]; meta: { available: Record<string, string[]> } }>(user?.is_admin ? '/settings/permissions' : null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [perms, setPerms] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const staff = useMemo(() => data?.data ?? [], [data]);
    const selected = staff.find((s) => s.id === selectedId) ?? null;

    useEffect(() => {
        if (!selectedId && staff.length) {
            setSelectedId((staff.find((s) => !s.is_admin) ?? staff[0]).id);
        }
    }, [staff, selectedId]);

    useEffect(() => {
        setPerms(selected?.permissions ?? []);
        setDirty(false);
    }, [selected]);

    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }
    if (loading || !data) {
        return <Spinner />;
    }

    const available = data.meta.available;
    const features = [...Object.keys(FEATURES).filter((f) => available[f]), ...Object.keys(available).filter((f) => !FEATURES[f])];
    const has = (key: string) => perms.includes(key);

    function toggle(key: string) {
        setPerms((list) => (list.includes(key) ? list.filter((p) => p !== key) : [...list, key]));
        setDirty(true);
    }

    function toggleRow(feature: string) {
        const keys = available[feature].map((cap) => `${feature}.${cap}`);
        const allOn = keys.every((k) => perms.includes(k));
        setPerms((list) => (allOn ? list.filter((p) => !keys.includes(p)) : [...new Set([...list, ...keys])]));
        setDirty(true);
    }

    function copyFrom(id: number) {
        const source = staff.find((s) => s.id === id);
        if (source) {
            setPerms([...source.permissions]);
            setDirty(true);
        }
    }

    function pick(id: number) {
        if (dirty && !confirm('You have unsaved changes for this staff member. Discard them?')) {
            return;
        }
        setSelectedId(id);
    }

    async function save() {
        if (!selected) {
            return;
        }
        setSaving(true);
        try {
            await api.put(`/settings/permissions/${selected.id}`, { permissions: perms });
            toast(`Permissions saved for ${selected.full_name}.`);
            setDirty(false);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    const shown = staff.filter((s) => !search || `${s.full_name} ${s.email ?? ''}`.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="panel_s self-start">
                <div className="panel-body space-y-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="pl-9" />
                    </div>
                    <ul className="max-h-[70vh] overflow-y-auto">
                        {shown.map((s) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onClick={() => pick(s.id)}
                                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left ${s.id === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                    <Avatar id={s.id} name={s.full_name} size="sm" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-medium text-gray-800">{s.full_name}</span>
                                        <span className="block truncate text-xs text-gray-500">{s.is_admin ? 'Admin — all permissions' : `${s.permissions.length} permission(s)`}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="panel_s">
                {!selected ? (
                    <p className="panel-body text-[13px] text-gray-500">Choose a staff member.</p>
                ) : (
                    <div className="panel-body space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <Avatar id={selected.id} name={selected.full_name} />
                            <div className="mr-auto">
                                <p className="font-semibold text-gray-900">{selected.full_name}</p>
                                <p className="text-xs text-gray-500">{selected.email}</p>
                            </div>
                            {!selected.is_admin && (
                                <>
                                    <Select value="" onChange={(e) => e.target.value && copyFrom(Number(e.target.value))} className="w-56">
                                        <option value="">Copy permissions from…</option>
                                        {staff
                                            .filter((s) => s.id !== selected.id && !s.is_admin && s.permissions.length)
                                            .map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.full_name}
                                                </option>
                                            ))}
                                    </Select>
                                    <Button onClick={save} loading={saving} disabled={!dirty}>
                                        Save
                                    </Button>
                                </>
                            )}
                        </div>

                        {selected.is_admin ? (
                            <p className="rounded-md bg-blue-50 p-3 text-[13px] text-blue-800">
                                {selected.full_name} is a company administrator in HRMS, so they have every permission here. To limit them, remove the admin role in HRMS.
                            </p>
                        ) : (
                            <div className="-mx-4 overflow-x-auto">
                                <table className="table-perfex">
                                    <thead>
                                        <tr>
                                            <th>Features</th>
                                            {CAPABILITIES.map((cap) => (
                                                <th key={cap} className="text-center">
                                                    {CAP_LABELS[cap]}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {features.map((feature) => (
                                            <tr key={feature}>
                                                <td>
                                                    <button type="button" onClick={() => toggleRow(feature)} className="text-left font-medium text-gray-800 hover:text-blue-700" title="Tick / untick the whole row">
                                                        {FEATURES[feature]?.label ?? feature}
                                                    </button>
                                                    {FEATURES[feature]?.hint && <span className="block text-xs text-gray-500">{FEATURES[feature].hint}</span>}
                                                </td>
                                                {CAPABILITIES.map((cap) => {
                                                    const key = `${feature}.${cap}`;

                                                    return (
                                                        <td key={cap} className="text-center">
                                                            {available[feature].includes(cap) ? (
                                                                <input type="checkbox" checked={has(key)} onChange={() => toggle(key)} className="h-4 w-4 rounded border-gray-300 text-blue-600" aria-label={`${FEATURES[feature]?.label ?? feature} ${CAP_LABELS[cap]}`} />
                                                            ) : (
                                                                <span className="text-gray-300">—</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
