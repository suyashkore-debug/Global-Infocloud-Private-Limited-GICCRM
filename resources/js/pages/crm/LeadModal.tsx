import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate, formatDateTime, timeAgo } from '../../lib/format';
import { money, PROPOSAL_STATUSES } from '../../lib/sales';
import { usePermission } from '../../hooks/usePermission';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, Input, Menu, MenuItem, Modal, Select, Spinner, StatusBadge, Tabs, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { FilesPanel, NotesPanel, RemindersPanel } from '../../components/records/RecordPanels';
import type { Lead, LeadStatus } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';
import { CustomFieldsView } from '../../components/customfields/CustomFields';
import LeadCalls from './LeadCalls';
import LeadWhatsApp from './LeadWhatsApp';
const appOptionsLoad = () => api.get<{ data: Record<string, string> }>('/app-options').then((r) => r.data.data).catch(() => ({}) as Record<string, string>);

type Tab = 'profile' | 'proposals' | 'attachments' | 'reminders' | 'notes' | 'activity' | 'whatsapp' | 'calls';

const blank = {
    name: '',
    title: '',
    company: '',
    description: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    lead_status_id: '',
    lead_source_id: '',
    assigned_id: '',
    lead_value: '',
    is_public: false,
    tags: [] as string[],
};

/**
 * Perfex lead modal: add a lead, or open one with its tabs and actions (convert to customer,
 * lost / junk, delete). leadId null + open = new lead.
 */
export default function LeadModal({ open, leadId, defaultStatusId, onClose, onChanged }: { open: boolean; leadId: number | null; defaultStatusId?: number; onClose: () => void; onChanged: () => void }) {
    const toast = useToast();
    const navigate = useNavigate();
    const staff = useStaff();
    const canCreateCustomer = usePermission('customers.create');
    const [lead, setLead] = useState<Lead | null>(null);
    const [statuses, setStatuses] = useState<LeadStatus[]>([]);
    const [sources, setSources] = useState<{ id: number; name: string }[]>([]);
    const [tab, setTab] = useState<Tab>('profile');
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('leads', lead?.id);
    const [convertOpen, setConvertOpen] = useState(false);

    async function load(id: number) {
        const { data } = await api.get<{ data: Lead }>(`/leads/${id}`);
        setLead(data.data);
        return data.data;
    }

    useEffect(() => {
        if (!open) {
            return;
        }
        setTab('profile');
        setErrors({});
        setLead(null);
        Promise.all([api.get<{ data: LeadStatus[] }>('/setup/lead-statuses'), api.get<{ data: { id: number; name: string }[] }>('/setup/lead-sources')]).then(async ([s, src]) => {
            setStatuses(s.data.data);
            setSources(src.data.data);
            if (!leadId) {
                setEditing(true);
                // Settings → Leads: default status and source of a new lead.
                const defaults = await appOptionsLoad();
                setForm({
                    ...blank,
                    lead_status_id: String(defaultStatusId ?? (defaults.leads_default_status || s.data.data[0]?.id || '')),
                    lead_source_id: String(defaults.leads_default_source || src.data.data[0]?.id || ''),
                });
            }
        });
        if (leadId) {
            setEditing(false);
            load(leadId).catch((e) => toast(errorMessage(e), 'error'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, leadId]);

    function startEdit(l: Lead) {
        setForm({
            ...blank,
            ...Object.fromEntries(Object.keys(blank).map((k) => [k, (l as unknown as Record<string, unknown>)[k] ?? ''])),
            lead_status_id: String(l.status?.id ?? ''),
            lead_source_id: String(l.source?.id ?? ''),
            assigned_id: String(l.assigned?.id ?? ''),
            lead_value: l.lead_value ?? '',
            is_public: l.is_public,
            tags: l.tags ?? [],
        } as typeof blank);
        setErrors({});
        setEditing(true);
    }

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        const payload = {
            ...form,
            lead_status_id: Number(form.lead_status_id),
            lead_source_id: Number(form.lead_source_id),
            assigned_id: form.assigned_id ? Number(form.assigned_id) : null,
            lead_value: form.lead_value || null,
        };
        try {
            const { data } = lead ? await api.put<{ data: Lead }>(`/leads/${lead.id}`, payload) : await api.post<{ data: Lead }>('/leads', payload);
            await cf.save(data.data.id);
            setLead(data.data);
            setEditing(false);
            toast(lead ? 'Lead updated.' : 'Lead added.');
            onChanged();
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    async function flag(name: 'lost' | 'junk', value: boolean) {
        const { data } = await api.post<{ data: Lead }>(`/leads/${lead!.id}/flag`, { flag: name, value });
        setLead(data.data);
        onChanged();
    }

    async function remove() {
        if (!confirm('Delete this lead?')) {
            return;
        }
        try {
            await api.delete(`/leads/${lead!.id}`);
            toast('Lead deleted.');
            onChanged();
            onClose();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    const title = lead ? (
        <span className="flex flex-wrap items-center gap-2">
            #{lead.id} - {lead.name}
            {lead.status && <StatusBadge option={{ id: lead.status.id, name: lead.status.name, color: lead.status.color }} />}
            {lead.lost && <span className="rounded bg-red-50 px-1.5 text-xs text-red-600">Lost</span>}
            {lead.junk && <span className="rounded bg-gray-100 px-1.5 text-xs text-gray-600">Junk</span>}
        </span>
    ) : (
        'Add new lead'
    );

    return (
        <>
            <Modal open={open && !convertOpen} onClose={onClose} size="xl" title={title}>
                {leadId && !lead ? (
                    <Spinner />
                ) : (
                    <div className="space-y-4">
                        {lead && (
                            <div className="flex flex-wrap items-center gap-2">
                                {lead.customer ? (
                                    <span className="text-[13px] text-gray-600">
                                        Customer: <Link to={`/customers/${lead.customer.id}`} onClick={onClose}>{lead.customer.name}</Link>
                                    </span>
                                ) : (
                                    lead.can.update &&
                                    canCreateCustomer && (
                                        <Button size="sm" onClick={() => setConvertOpen(true)}>
                                            Convert to customer
                                        </Button>
                                    )
                                )}
                                <div className="ml-auto flex gap-2">
                                    {lead.can.update && !editing && (
                                        <Button size="sm" variant="secondary" onClick={() => startEdit(lead)}>
                                            Edit
                                        </Button>
                                    )}
                                    <Menu
                                        trigger={(toggle) => (
                                            <Button size="sm" variant="secondary" onClick={toggle}>
                                                More <ChevronDown className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    >
                                        {(close) => (
                                            <>
                                                {lead.can.update && <MenuItem onClick={() => (close(), flag('lost', !lead.lost))}>{lead.lost ? 'Unmark as lost' : 'Mark as lost'}</MenuItem>}
                                                {lead.can.update && <MenuItem onClick={() => (close(), flag('junk', !lead.junk))}>{lead.junk ? 'Unmark as junk' : 'Mark as junk'}</MenuItem>}
                                                <MenuItem onClick={() => (close(), onClose(), navigate(`/proposals/new?lead_id=${lead.id}`))}>New Proposal</MenuItem>
                                                {lead.can.delete && (
                                                    <MenuItem danger onClick={() => (close(), remove())}>
                                                        Delete Lead
                                                    </MenuItem>
                                                )}
                                            </>
                                        )}
                                    </Menu>
                                </div>
                            </div>
                        )}

                        {lead && !editing && (
                            <Tabs
                                tabs={[
                                    { id: 'profile', label: 'Profile' },
                                    { id: 'proposals', label: 'Proposals', count: lead.proposals?.length ?? 0 },
                                    { id: 'attachments', label: 'Attachments', count: lead.attachments?.length ?? 0 },
                                    { id: 'reminders', label: 'Reminders' },
                                    { id: 'notes', label: 'Notes' },
                                    { id: 'activity', label: 'Activity Log' },
                                    { id: 'whatsapp', label: 'WhatsApp' },
                                    { id: 'calls', label: 'Call' },
                                ]}
                                active={tab}
                                onChange={setTab}
                            />
                        )}

                        {editing ? (
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Field label="Status" required error={errors.lead_status_id}>
                                    <Select value={form.lead_status_id} onChange={set('lead_status_id')}>
                                        {statuses.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label="Source" required error={errors.lead_source_id}>
                                    <Select value={form.lead_source_id} onChange={set('lead_source_id')}>
                                        {sources.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label="Assigned">
                                    <Select value={form.assigned_id} onChange={set('assigned_id')}>
                                        <option value="">Nobody</option>
                                        {staff.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.full_name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label="Tags" className="sm:col-span-3">
                                    <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
                                </Field>
                                <Field label="Name" required error={errors.name}>
                                    <Input value={form.name} onChange={set('name')} autoFocus />
                                </Field>
                                <Field label="Position">
                                    <Input value={form.title} onChange={set('title')} />
                                </Field>
                                <Field label="Email Address" error={errors.email}>
                                    <Input type="email" value={form.email} onChange={set('email')} />
                                </Field>
                                <Field label="Website">
                                    <Input value={form.website} onChange={set('website')} />
                                </Field>
                                <Field label="Phone">
                                    <Input value={form.phone} onChange={set('phone')} />
                                </Field>
                                <Field label="Lead Value" error={errors.lead_value}>
                                    <Input type="number" step="any" value={form.lead_value} onChange={set('lead_value')} />
                                </Field>
                                <Field label="Company">
                                    <Input value={form.company} onChange={set('company')} />
                                </Field>
                                <Field label="Address" className="sm:col-span-2">
                                    <Input value={form.address} onChange={set('address')} />
                                </Field>
                                <Field label="City">
                                    <Input value={form.city} onChange={set('city')} />
                                </Field>
                                <Field label="State">
                                    <Input value={form.state} onChange={set('state')} />
                                </Field>
                                <Field label="Country">
                                    <Input value={form.country} onChange={set('country')} />
                                </Field>
                                <Field label="Zip Code">
                                    <Input value={form.zip} onChange={set('zip')} />
                                </Field>
                                <Field label="Description" className="sm:col-span-3">
                                    <Textarea rows={3} value={form.description} onChange={set('description')} />
                                </Field>
                                <CustomFieldInputs cf={cf} className="sm:col-span-3" />
                                <Checkbox label="Public" checked={form.is_public} onChange={(v) => setForm({ ...form, is_public: v })} />
                                <div className="flex justify-end gap-2 sm:col-span-3">
                                    {lead && (
                                        <Button variant="secondary" onClick={() => setEditing(false)}>
                                            Cancel
                                        </Button>
                                    )}
                                    <Button onClick={save} loading={saving}>
                                        Save
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            lead && (
                                <div>
                                    {tab === 'profile' && <LeadProfile lead={lead} />}
                                    {tab === 'profile' && <CustomFieldsView to="leads" id={lead.id} className="mt-4 border-t border-gray-100 pt-4" />}
                                    {tab === 'proposals' && (
                                        <table className="table-perfex">
                                            <thead>
                                                <tr>
                                                    <th>Proposal #</th>
                                                    <th>Subject</th>
                                                    <th className="text-right">Total</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lead.proposals?.map((p) => (
                                                    <tr key={p.id}>
                                                        <td>
                                                            <Link to={`/proposals/${p.id}`} onClick={onClose}>
                                                                {p.formatted_number}
                                                            </Link>
                                                        </td>
                                                        <td>{p.subject}</td>
                                                        <td className="text-right">{money(p.total)}</td>
                                                        <td>
                                                            <StatusBadge option={optionById(PROPOSAL_STATUSES, p.status)} />
                                                        </td>
                                                    </tr>
                                                ))}
                                                {lead.proposals?.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="text-center text-gray-500">
                                                            No proposals.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                    {tab === 'attachments' && <FilesPanel type="lead" id={lead.id} files={lead.attachments ?? []} canUpload={lead.can.update} onChange={() => load(lead.id)} />}
                                    {tab === 'reminders' && <RemindersPanel type="lead" id={lead.id} />}
                                    {tab === 'notes' && <NotesPanel type="lead" id={lead.id} withContacted onChange={() => (load(lead.id), onChanged())} />}
                                    {tab === 'whatsapp' && <LeadWhatsApp leadId={lead.id} onSent={onChanged} />}
                                    {tab === 'calls' && <LeadCalls leadId={lead.id} onLogged={() => (load(lead.id), onChanged())} />}
                                    {tab === 'activity' && (
                                        <ul className="space-y-2.5">
                                            {lead.activities?.map((a) => (
                                                <li key={a.id} className="text-[13.5px]">
                                                    <span className="font-semibold">{a.user ?? 'System'}</span> - {a.description}
                                                    <span className="ml-2 text-xs text-gray-400" title={formatDateTime(a.created_at)}>
                                                        {timeAgo(a.created_at)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )
                        )}
                    </div>
                )}
            </Modal>
            {lead && (
                <ConvertModal
                    open={convertOpen}
                    lead={lead}
                    onClose={() => setConvertOpen(false)}
                    onDone={(customerId) => {
                        setConvertOpen(false);
                        onChanged();
                        onClose();
                        navigate(`/customers/${customerId}`);
                    }}
                />
            )}
        </>
    );
}

function LeadProfile({ lead }: { lead: Lead }) {
    const rows: [string, React.ReactNode][] = [
        ['Name', lead.name],
        ['Position', lead.title],
        ['Email Address', lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null],
        ['Website', lead.website],
        ['Phone', lead.phone],
        ['Lead Value', lead.lead_value ? money(lead.lead_value) : null],
        ['Company', lead.company],
        ['Address', lead.address],
        ['City', lead.city],
        ['State', lead.state],
        ['Country', lead.country],
        ['Zip Code', lead.zip],
        ['Source', lead.source?.name],
        ['Assigned', lead.assigned?.full_name],
        ['Tags', lead.tags?.join(', ')],
        ['Created', formatDateTime(lead.created_at)],
        ['Last Contact', lead.last_contact_at ? formatDateTime(lead.last_contact_at) : null],
        ['Public', lead.is_public ? 'Yes' : 'No'],
        ['Date Assigned', lead.assigned_at ? formatDate(lead.assigned_at) : null],
    ];

    return (
        <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
                {rows.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="font-medium">{value || '—'}</dd>
                    </div>
                ))}
            </dl>
            {lead.description && <p className="whitespace-pre-wrap border-t border-gray-100 pt-3 text-[13.5px] text-gray-700">{lead.description}</p>}
        </div>
    );
}

function ConvertModal({ open, lead, onClose, onDone }: { open: boolean; lead: Lead; onClose: () => void; onDone: (customerId: number) => void }) {
    const toast = useToast();
    const [form, setForm] = useState({ name: '', contact_first_name: '', contact_last_name: '', email: '', phone: '', title: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            const [first, ...rest] = lead.name.split(' ');
            setForm({ name: lead.company || lead.name, contact_first_name: first, contact_last_name: rest.join(' '), email: lead.email ?? '', phone: lead.phone ?? '', title: lead.title ?? '' });
            setErrors({});
            setError(null);
        }
    }, [open, lead]);

    async function convert() {
        try {
            const { data } = await api.post<{ data: { id: number } }>(`/leads/${lead.id}/convert`, form);
            toast('Lead converted to customer.');
            onDone(data.data.id);
        } catch (e) {
            setErrors(fieldErrors(e));
            setError(Object.keys(fieldErrors(e)).length ? null : errorMessage(e));
        }
    }

    const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Convert to customer"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={convert}>Save</Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <ErrorNote message={error} />
                </div>
                <Field label="Company" className="sm:col-span-2">
                    <Input value={form.name} onChange={set('name')} />
                </Field>
                <Field label="First Name" required error={errors.contact_first_name}>
                    <Input value={form.contact_first_name} onChange={set('contact_first_name')} />
                </Field>
                <Field label="Last Name">
                    <Input value={form.contact_last_name} onChange={set('contact_last_name')} />
                </Field>
                <Field label="Email" required error={errors.email}>
                    <Input type="email" value={form.email} onChange={set('email')} />
                </Field>
                <Field label="Phone">
                    <Input value={form.phone} onChange={set('phone')} />
                </Field>
                <Field label="Position" className="sm:col-span-2">
                    <Input value={form.title} onChange={set('title')} />
                </Field>
            </div>
        </Modal>
    );
}
