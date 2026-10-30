import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Building2, Check, ChevronDown, Download, ExternalLink, Globe, IndianRupee, Mail, MapPin, NotebookPen, Phone, Target, UserRound } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate, formatDateTime, timeAgo } from '../../lib/format';
import { money, PROPOSAL_STATUSES } from '../../lib/sales';
import { usePermission } from '../../hooks/usePermission';
import { useStaff } from '../../hooks/useStaff';
import { useAppOptions } from '../../hooks/useAppOptions';
import { Button, Checkbox, ErrorNote, Field, FormSection, IconInput, Input, Menu, MenuItem, Modal, Select, Spinner, StatusBadge, Tabs, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { FilesPanel, NotesPanel, RemindersPanel } from '../../components/records/RecordPanels';
import type { Lead, LeadStatus } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';
import { CustomFieldsView } from '../../components/customfields/CustomFields';
import LeadCalls from './LeadCalls';
import LeadWhatsApp from './LeadWhatsApp';
import { QualificationCard } from './LeadRating';
import LeadTimeline from './LeadTimeline';
import TasksBoard from '../../components/tasks/TasksBoard';
import { COUNTRIES, LANGUAGES } from '../../lib/countries';
import { celebrate } from '../../lib/celebrate';
/** Setup → Leads "Modal Width Class" → the lead panel size. */
const LEAD_WIDTHS: Record<string, 'lg' | 'xl' | 'xxl'> = { 'modal-lg': 'lg', 'modal-xl': 'xl', 'modal-xxl': 'xxl' };
const appOptionsLoad = () => api.get<{ data: Record<string, string> }>('/app-options').then((r) => r.data.data).catch(() => ({}) as Record<string, string>);

type Tab = 'profile' | 'proposals' | 'tasks' | 'attachments' | 'reminders' | 'notes' | 'activity' | 'whatsapp' | 'calls';

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
    default_language: '',
    last_contact_at: '',
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
    const appOptions = useAppOptions();
    const canCreateCustomer = usePermission('customers.create');
    const [lead, setLead] = useState<Lead | null>(null);
    const [statuses, setStatuses] = useState<LeadStatus[]>([]);
    const [sources, setSources] = useState<{ id: number; name: string }[]>([]);
    const [tab, setTab] = useState<Tab>('profile');
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    // New lead: "Contacted Today" (default) sets the last contact to now; untick it to give the date.
    const [contactedToday, setContactedToday] = useState(true);
    const [contactedAt, setContactedAt] = useState('');
    const [activity, setActivity] = useState('');
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
                    country: defaults.customer_default_country || 'India',
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
            last_contact_at: l.last_contact_at ? toLocalDateTime(l.last_contact_at) : '',
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
            last_contact_at: form.last_contact_at ? new Date(form.last_contact_at).toISOString() : null,
            default_language: form.default_language || null,
            ...(lead ? {} : { last_contact_at: contactedToday ? new Date().toISOString() : contactedAt ? new Date(contactedAt).toISOString() : null }),
            // Perfex: the e-mail changed on a lead with proposals → ask whether they move to it too.
            ...(lead && lead.email && form.email !== lead.email && (lead.proposals?.length ?? 0) > 0
                ? { update_proposal_emails: window.confirm('The e-mail changed. Also update it on the proposals of this lead?') }
                : {}),
        };
        try {
            const { data } = lead ? await api.put<{ data: Lead }>(`/leads/${lead.id}`, payload) : await api.post<{ data: Lead }>('/leads', payload);
            await cf.save(data.data.id);
            setLead(data.data);
            setEditing(false);
            toast(lead ? 'Lead updated.' : 'Lead added.');
            // Moved to the won (Customer) status.
            if (data.data.status?.is_default && !lead?.status?.is_default) {
                celebrate();
            }
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
            <Modal open={open && !convertOpen} onClose={onClose} size={LEAD_WIDTHS[appOptions?.lead_modal_class ?? ''] ?? 'xl'} title={title}>
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
                                                <MenuItem onClick={() => (close(), printLead(lead))}>Print</MenuItem>
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
                                    { id: 'tasks', label: 'Tasks', count: lead.tasks_count ?? 0 },
                                    { id: 'attachments', label: 'Attachments', count: lead.attachments?.length ?? 0 },
                                    { id: 'reminders', label: 'Reminders', count: lead.reminders?.length ?? 0 },
                                    { id: 'notes', label: 'Notes', count: lead.notes?.length ?? 0 },
                                    { id: 'activity', label: 'Activity Log' },
                                    { id: 'whatsapp', label: 'WhatsApp' },
                                    { id: 'calls', label: 'Call' },
                                ]}
                                active={tab}
                                onChange={setTab}
                            />
                        )}

                        {editing ? (
                            <div className="space-y-4">
                                <FormSection icon={Target} title="Lead details" hint="Where the lead is in your pipeline and who looks after it.">
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
                                        <Field label="Default Language" hint="The language for e-mails to this lead.">
                                            <Select value={form.default_language} onChange={set('default_language')}>
                                                <option value="">System Default</option>
                                                {LANGUAGES.map((name) => (
                                                    <option key={name} value={name}>
                                                        {name}
                                                    </option>
                                                ))}
                                            </Select>
                                        </Field>
                                        <Field label="Lead Value" error={errors.lead_value}>
                                            <IconInput icon={IndianRupee} type="number" step="any" value={form.lead_value} onChange={set('lead_value')} placeholder="0.00" />
                                        </Field>
                                        <Field label="Tags" className="sm:col-span-2">
                                            <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
                                        </Field>
                                    </div>
                                </FormSection>

                                <FormSection icon={UserRound} title="Contact" hint="The person you are talking to.">
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <Field label="Name" required error={errors.name}>
                                            <IconInput icon={UserRound} value={form.name} onChange={set('name')} placeholder="Full name" autoFocus />
                                        </Field>
                                        <Field label="Position">
                                            <IconInput icon={BriefcaseBusiness} value={form.title} onChange={set('title')} placeholder="e.g. Purchase Manager" />
                                        </Field>
                                        <Field label="Company">
                                            <IconInput icon={Building2} value={form.company} onChange={set('company')} placeholder="Company name" />
                                        </Field>
                                        <Field label="Email Address" error={errors.email}>
                                            <IconInput icon={Mail} type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" />
                                        </Field>
                                        <Field label="Phone" error={errors.phone}>
                                            <IconInput icon={Phone} value={form.phone} onChange={set('phone')} placeholder="98765 43210" />
                                        </Field>
                                        <Field label="Website" error={errors.website}>
                                            <div className="flex gap-1.5">
                                                <div className="min-w-0 flex-1">
                                                    <IconInput icon={Globe} value={form.website} onChange={set('website')} placeholder="www.example.com" />
                                                </div>
                                                {form.website.trim() && (
                                                    <a href={withHttp(form.website)} target="_blank" rel="noopener noreferrer" title="Open the website" className="flex w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand ring-1 ring-brand-100 hover:bg-brand-100">
                                                        <ExternalLink className="h-4 w-4" />
                                                    </a>
                                                )}
                                            </div>
                                        </Field>
                                    </div>
                                </FormSection>

                                <FormSection icon={MapPin} title="Address">
                                    <div className="grid gap-4 sm:grid-cols-4">
                                        <Field label="Street address" className="sm:col-span-4">
                                            <IconInput icon={MapPin} value={form.address} onChange={set('address')} placeholder="Building, street, area" />
                                        </Field>
                                        <Field label="City">
                                            <Input value={form.city} onChange={set('city')} />
                                        </Field>
                                        <Field label="State">
                                            <Input value={form.state} onChange={set('state')} />
                                        </Field>
                                        <Field label="Country">
                                            <Select value={form.country} onChange={set('country')}>
                                                <option value="">Nothing selected</option>
                                                {form.country && !COUNTRIES.includes(form.country) && <option value={form.country}>{form.country}</option>}
                                                {COUNTRIES.map((name) => (
                                                    <option key={name} value={name}>
                                                        {name}
                                                    </option>
                                                ))}
                                            </Select>
                                        </Field>
                                        <Field label="Zip Code">
                                            <Input value={form.zip} onChange={set('zip')} />
                                        </Field>
                                    </div>
                                </FormSection>

                                <FormSection icon={NotebookPen} title="Notes">
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <Field label="Description" className="sm:col-span-3">
                                            <Textarea rows={3} value={form.description} onChange={set('description')} placeholder="What does the lead need? Anything the team should know…" />
                                        </Field>
                                        <CustomFieldInputs cf={cf} className="sm:col-span-3" />
                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:col-span-3">
                                            <Checkbox label="Public: everyone in the team can see this lead" checked={form.is_public} onChange={(v) => setForm({ ...form, is_public: v })} />
                                            {!lead && <Checkbox label="Contacted Today" checked={contactedToday} onChange={setContactedToday} />}
                                            {lead && (
                                                <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                                                    Last Contact
                                                    <Input type="datetime-local" value={form.last_contact_at} onChange={set('last_contact_at')} className="!w-56" />
                                                </label>
                                            )}
                                            {!lead && !contactedToday && (
                                                <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                                                    Date Contacted
                                                    <Input type="datetime-local" value={contactedAt} onChange={(e) => setContactedAt(e.target.value)} className="!w-56" />
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                </FormSection>

                                <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-2 border-t border-slate-100 bg-white/90 px-6 py-3.5 backdrop-blur">
                                    {lead && (
                                        <Button variant="secondary" onClick={() => setEditing(false)}>
                                            Cancel
                                        </Button>
                                    )}
                                    <Button onClick={save} loading={saving}>
                                        <Check className="h-4 w-4" />
                                        {lead ? 'Save changes' : 'Add lead'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            lead && (
                                <div>
                                    {tab === 'profile' && <LeadProfile lead={lead} onChanged={(l) => (setLead(l), onChanged())} />}
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
                                    {tab === 'tasks' && <TasksBoard lead={{ id: lead.id, name: lead.name }} />}
                                    {tab === 'attachments' && (
                                        <div className="space-y-3">
                                            {(lead.attachments?.length ?? 0) > 1 && (
                                                <div className="flex justify-end">
                                                    <Button variant="secondary" size="sm" onClick={() => downloadAll(lead.id).catch((e) => toast(errorMessage(e), 'error'))}>
                                                        <Download className="h-4 w-4" /> Download all
                                                    </Button>
                                                </div>
                                            )}
                                            <FilesPanel type="lead" id={lead.id} files={lead.attachments ?? []} canUpload={lead.can.update} onChange={() => load(lead.id)} />
                                        </div>
                                    )}
                                    {tab === 'reminders' && <RemindersPanel type="lead" id={lead.id} />}
                                    {tab === 'notes' && <NotesPanel type="lead" id={lead.id} withContacted onChange={() => (load(lead.id), onChanged())} />}
                                    {tab === 'whatsapp' && <LeadWhatsApp leadId={lead.id} onSent={onChanged} />}
                                    {tab === 'calls' && <LeadCalls leadId={lead.id} onLogged={() => (load(lead.id), onChanged())} />}
                                    {tab === 'activity' && (
                                        <div className="space-y-5">
                                            <form
                                                className="flex gap-2"
                                                onSubmit={async (e) => {
                                                    e.preventDefault();
                                                    if (!activity.trim()) {
                                                        return;
                                                    }
                                                    try {
                                                        const { data } = await api.post<{ data: Lead }>(`/leads/${lead.id}/activities`, { description: activity });
                                                        setLead(data.data);
                                                        setActivity('');
                                                    } catch (err) {
                                                        toast(errorMessage(err), 'error');
                                                    }
                                                }}
                                            >
                                                <Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Enter activity, e.g. Called, will visit on Monday" />
                                                <Button type="submit" disabled={!activity.trim()}>
                                                    Submit
                                                </Button>
                                            </form>
                                            <LeadTimeline activities={lead.activities ?? []} />
                                        </div>
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
                        celebrate();
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

function LeadProfile({ lead, onChanged }: { lead: Lead; onChanged: (lead: Lead) => void }) {
    const rows: [string, React.ReactNode][] = [
        ['Name', lead.name],
        ['Position', lead.title],
        ['Email Address', lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null],
        ['Website', lead.website ? <a href={withHttp(lead.website)} target="_blank" rel="noopener noreferrer">{lead.website}</a> : null],
        ['Phone', lead.phone],
        ['Lead Value', lead.lead_value ? money(lead.lead_value) : null],
        ['Company', lead.company],
        ['Address', lead.address],
        ['City', lead.city],
        ['State', lead.state],
        ['Country', lead.country],
        ['Zip Code', lead.zip],
        ['Source', lead.web_form ? `${lead.source?.name ?? ''} · Web to Lead form: ${lead.web_form}` : lead.source?.name],
        ['Assigned', lead.assigned?.full_name],
        ['Tags', lead.tags?.join(', ')],
        ['Created', formatDateTime(lead.created_at)],
        ['Last Contact', lead.last_contact_at ? formatDateTime(lead.last_contact_at) : null],
        ['Public', lead.is_public ? 'Yes' : 'No'],
        ['Default Language', lead.default_language || 'System Default'],
        ['Date Assigned', lead.assigned_at ? formatDate(lead.assigned_at) : null],
    ];

    return (
        <div className="space-y-4">
            <QualificationCard lead={lead} onChanged={onChanged} />
            <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
                {rows.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="font-medium">{value || '—'}</dd>
                    </div>
                ))}
            </dl>
            {lead.description && <p className="whitespace-pre-wrap border-t border-gray-100 pt-3 text-[13.5px] text-gray-700">{lead.description}</p>}
            {lead.activities?.[0] && (
                <div className="border-t border-gray-100 pt-3 text-[13.5px]">
                    <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wider text-slate-400">Latest Activity</p>
                    <p className="text-slate-700">
                        {lead.activities[0].description}
                        <span className="ml-2 text-xs text-slate-400">
                            {lead.activities[0].user ?? 'System'} · {timeAgo(lead.activities[0].created_at)}
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
}

function ConvertModal({ open, lead, onClose, onDone }: { open: boolean; lead: Lead; onClose: () => void; onDone: (customerId: number) => void }) {
    const toast = useToast();
    const [form, setForm] = useState({ name: '', contact_first_name: '', contact_last_name: '', email: '', phone: '', title: '', password: '' });
    const [options, setOptions] = useState({ send_set_password_email: true, transfer_notes: true, copy_custom_fields: true });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            const [first, ...rest] = lead.name.split(' ');
            setForm({ name: lead.company || lead.name, contact_first_name: first, contact_last_name: rest.join(' '), email: lead.email ?? '', phone: lead.phone ?? '', title: lead.title ?? '', password: '' });
            setOptions({ send_set_password_email: true, transfer_notes: true, copy_custom_fields: true });
            setErrors({});
            setError(null);
        }
    }, [open, lead]);

    async function convert() {
        setSaving(true);
        try {
            const { data } = await api.post<{ data: { id: number } }>(`/leads/${lead.id}/convert`, { ...form, password: form.password || null, ...options, send_set_password_email: !form.password && options.send_set_password_email });
            toast('Lead converted to customer.');
            onDone(data.data.id);
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
            title="Convert to customer"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={convert} loading={saving}>
                        Save
                    </Button>
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
                <Field label="Password" error={errors.password} hint="For the customer area. Leave empty to e-mail a link instead." className="sm:col-span-2">
                    <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                </Field>
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
                    {!form.password && (
                        <Checkbox label="Send set password email" checked={options.send_set_password_email} onChange={(v) => setOptions({ ...options, send_set_password_email: v })} />
                    )}
                    <Checkbox label="Transfer lead notes to customer profile" checked={options.transfer_notes} onChange={(v) => setOptions({ ...options, transfer_notes: v })} />
                    <Checkbox label="Copy custom fields (into the customer's custom fields with the same name)" checked={options.copy_custom_fields} onChange={(v) => setOptions({ ...options, copy_custom_fields: v })} />
                </div>
            </div>
        </Modal>
    );
}

/** Perfex "Download all": the lead's files in one .zip. */
async function downloadAll(leadId: number) {
    const response = await api.get(`/records/lead/${leadId}/files/zip`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lead-${leadId}-files.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Perfex "Print": the lead's profile on a plain page, printed. */
function printLead(lead: Lead) {
    const rows: [string, string | null | undefined][] = [
        ['Name', lead.name],
        ['Position', lead.title],
        ['Company', lead.company],
        ['Email', lead.email],
        ['Phone', lead.phone],
        ['Website', lead.website],
        ['Lead value', lead.lead_value],
        ['Address', [lead.address, lead.city, lead.state, lead.zip, lead.country].filter(Boolean).join(', ')],
        ['Status', lead.status?.name],
        ['Source', lead.source?.name],
        ['Assigned', lead.assigned?.full_name],
        ['Tags', lead.tags?.join(', ')],
        ['Rating', `${lead.rating}/5`],
        ['Created', formatDateTime(lead.created_at)],
        ['Last contact', lead.last_contact_at ? formatDateTime(lead.last_contact_at) : null],
        ['Description', lead.description],
    ];
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) {
        return;
    }
    win.document.write(`<!doctype html><html><head><title>Lead #${lead.id} - ${escapeHtml(lead.name)}</title><style>
        body{font-family:Inter,Arial,sans-serif;color:#1e293b;margin:32px}h1{font-size:22px;margin:0 0 4px;color:#0b2c56}
        p.sub{margin:0 0 20px;color:#64748b;font-size:13px}table{border-collapse:collapse;width:100%;font-size:13.5px}
        th{text-align:left;width:160px;color:#64748b;font-weight:600;padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;white-space:pre-wrap}</style></head><body>
        <h1>#${lead.id} ${escapeHtml(lead.name)}</h1><p class="sub">Lead profile</p><table>
        ${rows.map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(v || '—')}</td></tr>`).join('')}
        </table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
}

/** A saved date-time as the value of a datetime-local input (local time). */
function toLocalDateTime(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const withHttp = (url: string) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);