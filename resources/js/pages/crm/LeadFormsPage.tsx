import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Bell, Code2, Copy, ExternalLink, FileText, Globe, Plus, Settings2, Share2, Trash2, Wand2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { COUNTRIES, LANGUAGES } from '../../lib/countries';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { useStaff } from '../../hooks/useStaff';
import { useAppOptions } from '../../hooks/useAppOptions';
import { Button, Checkbox, EmptyState, ErrorNote, Field, FormSection, Input, Modal, Select, Spinner, StaffMultiSelect, Tabs, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { fetchDefinitions, type CustomFieldDef } from '../../components/customfields/CustomFields';
import type { FieldType, FormField } from '../estimate-requests/types';

export type LeadWebForm = {
    id: number;
    form_key: string;
    name: string;
    fields: FormField[];
    lead_status_id: number | null;
    lead_source_id: number | null;
    responsible_id: number | null;
    lead_name_prefix: string | null;
    language: string | null;
    submit_btn_name: string;
    submit_btn_bg_color: string;
    submit_btn_text_color: string;
    submit_action: 'message' | 'redirect';
    success_submit_msg: string | null;
    submit_redirect_url: string | null;
    mark_public: boolean;
    allow_duplicate: boolean;
    track_duplicate_field: string | null;
    track_duplicate_field_and: string | null;
    create_task_on_duplicate: boolean;
    notify_lead_imported: boolean;
    notify_type: 'specific_staff' | 'roles' | 'assigned' | null;
    notify_ids: number[] | null;
    active: boolean;
    recaptcha: boolean;
    leads_count?: number;
    created_at: string;
};

/** Lead fields a form field can fill (Perfex web to lead "database fields"), with their usual input. */
const LEAD_FIELDS: { name: string; label: string; type: FieldType; options?: string[] }[] = [
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'first_name', label: 'First Name', type: 'text' },
    { name: 'last_name', label: 'Last Name', type: 'text' },
    { name: 'title', label: 'Position', type: 'text' },
    { name: 'email', label: 'Email Address', type: 'email' },
    { name: 'phone', label: 'Phone', type: 'text' },
    { name: 'lead_value', label: 'Lead value', type: 'number' },
    { name: 'company', label: 'Company', type: 'text' },
    { name: 'address', label: 'Address', type: 'textarea' },
    { name: 'city', label: 'City', type: 'text' },
    { name: 'state', label: 'State', type: 'text' },
    { name: 'country', label: 'Country', type: 'select', options: COUNTRIES },
    { name: 'zip', label: 'Zip Code', type: 'text' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'website', label: 'Website', type: 'text' },
];

const FIELD_TYPES: { id: FieldType; label: string }[] = [
    { id: 'text', label: 'Text' },
    { id: 'email', label: 'Email' },
    { id: 'number', label: 'Number' },
    { id: 'textarea', label: 'Text Area' },
    { id: 'select', label: 'Select' },
    { id: 'radio', label: 'Radio Group' },
    { id: 'checkbox', label: 'Checkbox Group' },
    { id: 'date', label: 'Date' },
    { id: 'file', label: 'File Upload' },
];

const DUPLICATE_FIELDS = [
    { value: 'email', label: 'Email Address' },
    { value: 'phone', label: 'Phone' },
    { value: 'website', label: 'Website' },
    { value: 'company', label: 'Company' },
    { value: 'name', label: 'Name' },
];

const DEFAULT_FIELDS: FormField[] = [
    { type: 'text', name: 'name', label: 'Name', required: true },
    { type: 'email', name: 'email', label: 'Email Address', required: true },
    { type: 'text', name: 'phone', label: 'Phone' },
    { type: 'text', name: 'company', label: 'Company' },
    { type: 'textarea', name: 'description', label: 'How can we help you?' },
];

const publicUrl = (key: string, source?: string) => `${window.location.origin}/forms/wtl/${key}${source ? `?source=${source}` : ''}`;

/** Where a form can be shared; each gets its own link, so its leads get that source. */
const CHANNELS: { key: string; label: string; color: string }[] = [
    { key: 'facebook', label: 'Facebook', color: '#1877f2' },
    { key: 'instagram', label: 'Instagram', color: '#e1306c' },
    { key: 'whatsapp', label: 'WhatsApp', color: '#16a34a' },
    { key: 'linkedin', label: 'LinkedIn', color: '#0a66c2' },
    { key: 'youtube', label: 'YouTube', color: '#ff0000' },
    { key: 'twitter', label: 'Twitter (X)', color: '#0f172a' },
    { key: 'googleads', label: 'Google Ads', color: '#f59e0b' },
    { key: 'email', label: 'Email', color: '#64748b' },
    { key: 'sms', label: 'SMS', color: '#64748b' },
    { key: 'qr', label: 'QR Code / print', color: '#64748b' },
];
const embedCode = (key: string) => `<iframe width="600" height="850" src="${publicUrl(key, 'website')}" frameborder="0" sandbox="allow-top-navigation allow-forms allow-scripts allow-same-origin allow-popups" allowfullscreen></iframe>`;

/** What a field fills on the lead, for the builder's badges. */
type Named = { id: number; name: string };

/**
 * Status and source lists, and which one a form on "default" gives its leads: Setup → Leads, else
 * the first status (in kanban order) and the first source added, as the server does.
 */
function useLeadLists() {
    const options = useAppOptions();
    const statuses = useApi<{ data: Named[] }>('/setup/lead-statuses');
    const sources = useApi<{ data: Named[] }>('/setup/lead-sources');
    const statusList = statuses.data?.data ?? [];
    const sourceList = sources.data?.data ?? [];
    const defaultStatus = statusList.find((s) => String(s.id) === options?.leads_default_status) ?? statusList[0];
    const defaultSource = sourceList.find((s) => String(s.id) === options?.leads_default_source) ?? [...sourceList].sort((a, b) => a.id - b.id)[0];

    return { statusList, sourceList, defaultStatus, defaultSource };
}

function fillsLabel(name: string, custom: CustomFieldDef[]): string {
    const lead = LEAD_FIELDS.find((f) => f.name === name);
    if (lead) {
        return `Lead → ${lead.label}`;
    }
    const cf = name.match(/^cf_(\d+)$/) && custom.find((c) => `cf_${c.id}` === name);
    return cf ? `Custom field → ${cf.name}` : 'Added to the description';
}

/** A lead custom field as a form field of the matching kind. */
function customAsField(cf: CustomFieldDef): FormField {
    const type: FieldType =
        cf.type === 'number' ? 'number' : cf.type === 'textarea' ? 'textarea' : cf.type === 'select' ? 'select' : cf.type === 'multiselect' || cf.type === 'checkbox' ? 'checkbox' : cf.type.startsWith('date') ? 'date' : 'text';
    return { type, name: `cf_${cf.id}`, label: cf.name, required: cf.required, ...(cf.options?.length ? { options: cf.options } : {}) };
}

/** Leads → Web to Lead (Perfex): the public forms whose submissions become leads. */
export default function LeadFormsPage() {
    const { user } = useAuth();
    const toast = useToast();
    const { data, reload } = useApi<{ data: LeadWebForm[] }>(user?.is_admin ? '/lead-forms' : null);
    const lists = useLeadLists();
    const named = (list: Named[], id: number | null, fallback: Named | undefined) =>
        id ? (list.find((x) => x.id === id)?.name ?? `#${id}`) : <span className="text-slate-500">Default{fallback ? ` (${fallback.name})` : ''}</span>;
    const [editing, setEditing] = useState<LeadWebForm | 'new' | null>(null);

    if (!user?.is_admin) {
        return <Navigate to="/leads" replace />;
    }

    async function remove(form: LeadWebForm) {
        if (!confirm(`Delete the form "${form.name}"? Leads already received are kept.`)) {
            return;
        }
        await api.delete(`/lead-forms/${form.id}`);
        toast('Form deleted.');
        reload();
    }

    const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied.'));
    const [sharing, setSharing] = useState<LeadWebForm | null>(null);

    async function toggleActive(form: LeadWebForm) {
        try {
            await api.patch(`/lead-forms/${form.id}/active`, { active: !form.active });
            toast(form.active ? 'Form deactivated: it no longer accepts submissions.' : 'Form activated.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link to="/leads" className="text-slate-500 hover:text-slate-800" title="Back to leads">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">Web to Lead</h4>
                <Button onClick={() => setEditing('new')}>
                    <Plus className="h-4 w-4" /> New Form
                </Button>
            </div>
            <p className="max-w-3xl text-[13.5px] text-slate-500">
                Put these forms on your website (a link or an embedded form). Every submission becomes a lead with the status, source and responsible person you choose, and your team is notified.
            </p>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState
                    icon={Globe}
                    title="No web to lead forms yet"
                    text="Create a form, then put its link or embed code on your website to collect leads automatically."
                    action={
                        <Button onClick={() => setEditing('new')}>
                            <Plus className="h-4 w-4" /> Create a form
                        </Button>
                    }
                />
            ) : (
                <div className="panel_s overflow-x-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Source</th>
                                <th className="text-right">Total Submissions</th>
                                <th>Active</th>
                                <th>Date Created</th>
                                <th>Link</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((f) => (
                                <tr key={f.id}>
                                    <td>
                                        <button type="button" onClick={() => setEditing(f)} className="font-semibold text-brand-light hover:text-accent">
                                            {f.name}
                                        </button>
                                    </td>
                                    <td>{named(lists.statusList, f.lead_status_id, lists.defaultStatus)}</td>
                                    <td>{named(lists.sourceList, f.lead_source_id, lists.defaultSource)}</td>
                                    <td className="text-right">{f.leads_count ?? 0}</td>
                                    <td>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={f.active}
                                            onClick={() => toggleActive(f)}
                                            title={f.active ? 'Active: click to stop accepting submissions' : 'Inactive: click to accept submissions'}
                                            className="inline-flex items-center gap-2 text-[12.5px] font-semibold"
                                        >
                                            <span className={`relative h-5 w-9 rounded-full transition ${f.active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${f.active ? 'left-[18px]' : 'left-0.5'}`} />
                                            </span>
                                            <span className={f.active ? 'text-emerald-600' : 'text-slate-400'}>{f.active ? 'Active' : 'Inactive'}</span>
                                        </button>
                                    </td>
                                    <td>{formatDate(f.created_at)}</td>
                                    <td>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            <a href={publicUrl(f.form_key)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-brand hover:text-white">
                                                <ExternalLink className="h-3 w-3" /> Open
                                            </a>
                                            <button type="button" onClick={() => copy(publicUrl(f.form_key))} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-brand hover:text-white">
                                                <Copy className="h-3 w-3" /> Link
                                            </button>
                                            <button type="button" onClick={() => setSharing(f)} className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 font-semibold text-accent hover:bg-accent hover:text-white">
                                                <Share2 className="h-3 w-3" /> Share links
                                            </button>
                                            <button type="button" onClick={() => copy(embedCode(f.form_key))} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-brand hover:text-white">
                                                <Code2 className="h-3 w-3" /> Embed code
                                            </button>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <button type="button" onClick={() => remove(f)} className="text-slate-400 hover:text-red-600" title="Delete">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {sharing && <ShareLinks form={sharing} onClose={() => setSharing(null)} onCopy={copy} />}
            {editing && (
                <FormEditor
                    form={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={(saved) => {
                        reload();
                        setEditing(saved);
                    }}
                />
            )}
        </div>
    );
}

const slug = (label: string) =>
    label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'question';

type Tab = 'build' | 'info' | 'notify' | 'code';

function FormEditor({ form, onClose, onSaved }: { form: LeadWebForm | null; onClose: () => void; onSaved: (form: LeadWebForm) => void }) {
    const toast = useToast();
    const staff = useStaff();
    const lists = useLeadLists();
    const [custom, setCustom] = useState<CustomFieldDef[]>([]);
    const [tab, setTab] = useState<Tab>('build');
    const [state, setState] = useState({
        name: form?.name ?? '',
        fields: form?.fields ?? DEFAULT_FIELDS,
        lead_status_id: String(form?.lead_status_id ?? ''),
        lead_source_id: String(form?.lead_source_id ?? ''),
        responsible_id: String(form?.responsible_id ?? ''),
        lead_name_prefix: form?.lead_name_prefix ?? '',
        language: form?.language ?? '',
        submit_btn_name: form?.submit_btn_name ?? 'Submit',
        submit_btn_bg_color: form?.submit_btn_bg_color ?? '#0b2c56',
        submit_btn_text_color: form?.submit_btn_text_color ?? '#ffffff',
        submit_action: form?.submit_action ?? 'message',
        success_submit_msg: form?.success_submit_msg ?? 'Thank you! We have received your details and will get back to you soon.',
        submit_redirect_url: form?.submit_redirect_url ?? '',
        mark_public: form?.mark_public ?? false,
        allow_duplicate: form?.allow_duplicate ?? true,
        track_duplicate_field: form?.track_duplicate_field ?? 'email',
        track_duplicate_field_and: form?.track_duplicate_field_and ?? '',
        create_task_on_duplicate: form?.create_task_on_duplicate ?? false,
        notify_lead_imported: form?.notify_lead_imported ?? true,
        notify_type: form?.notify_type ?? 'assigned',
        notify_ids: form?.notify_ids ?? [],
        active: form?.active ?? true,
        recaptcha: form?.recaptcha ?? false,
    });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchDefinitions('leads').then(setCustom);
    }, []);

    const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
    const setField = (i: number, patch: Partial<FormField>) => set({ fields: state.fields.map((f, fi) => (fi === i ? { ...f, ...patch } : f)) });
    const move = (i: number, dir: -1 | 1) => {
        const next = [...state.fields];
        [next[i], next[i + dir]] = [next[i + dir], next[i]];
        set({ fields: next });
    };
    const used = new Set(state.fields.map((f) => f.name));
    const add = (field: FormField) => set({ fields: [...state.fields, field] });

    async function save() {
        setSaving(true);
        setError(null);
        const body = {
            ...state,
            lead_status_id: state.lead_status_id ? Number(state.lead_status_id) : null,
            lead_source_id: state.lead_source_id ? Number(state.lead_source_id) : null,
            responsible_id: state.responsible_id ? Number(state.responsible_id) : null,
            lead_name_prefix: state.lead_name_prefix || null,
            language: state.language || null,
            submit_redirect_url: state.submit_redirect_url || null,
            track_duplicate_field: state.allow_duplicate ? null : state.track_duplicate_field || null,
            track_duplicate_field_and: state.allow_duplicate ? null : state.track_duplicate_field_and || null,
            notify_type: state.notify_lead_imported ? state.notify_type : null,
        };
        try {
            const { data } = form ? await api.put<{ data: LeadWebForm }>(`/lead-forms/${form.id}`, body) : await api.post<{ data: LeadWebForm }>('/lead-forms', body);
            toast(form ? 'Form saved.' : 'Form created. Copy its link or embed code from Integration Code.');
            onSaved(data.data);
            if (!form) {
                setTab('code');
            }
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied.'));

    return (
        <Modal
            open
            size="xxl"
            title={form ? `${form.name} - Web to Lead Form` : 'New Web to Lead Form'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!state.name.trim()}>
                        {form ? 'Save' : 'Create form'}
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                <Tabs
                    tabs={[
                        { id: 'build' as Tab, label: 'Form Builder' },
                        { id: 'info' as Tab, label: 'Form Information' },
                        { id: 'notify' as Tab, label: 'Notifications' },
                        ...(form ? [{ id: 'code' as Tab, label: 'Integration Code' }] : []),
                    ]}
                    active={tab}
                    onChange={setTab}
                />
                <ErrorNote message={error} />

                {tab === 'build' && (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <div className="space-y-4">
                            <Field label="Form Name" required>
                                <Input value={state.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Website contact form" />
                            </Field>
                            <FormSection icon={Wand2} title="Add a field" hint="Lead fields fill the lead; your own questions are added to its description.">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {LEAD_FIELDS.filter((f) => !used.has(f.name)).map((f) => (
                                            <button
                                                key={f.name}
                                                type="button"
                                                onClick={() => add({ type: f.type, name: f.name, label: f.label, ...(f.options ? { options: f.options } : {}) })}
                                                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[12.5px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-brand hover:ring-brand/40"
                                            >
                                                <Plus className="h-3 w-3" /> {f.label}
                                            </button>
                                        ))}
                                    </div>
                                    {custom.filter((c) => !used.has(`cf_${c.id}`)).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {custom
                                                .filter((c) => !used.has(`cf_${c.id}`))
                                                .map((c) => (
                                                    <button key={c.id} type="button" onClick={() => add(customAsField(c))} className="inline-flex items-center gap-1 rounded-lg bg-accent-50 px-2.5 py-1 text-[12.5px] font-semibold text-accent ring-1 ring-accent/20 hover:ring-accent/50">
                                                        <Plus className="h-3 w-3" /> {c.name}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                    <Button variant="secondary" size="sm" onClick={() => add({ type: 'text', name: `question_${state.fields.length + 1}`, label: '' })}>
                                        <Plus className="h-4 w-4" /> Your own question
                                    </Button>
                                </div>
                            </FormSection>

                            <div className="space-y-2">
                                {state.fields.map((f, i) => {
                                    const isLead = LEAD_FIELDS.some((l) => l.name === f.name);
                                    const isCustom = /^cf_\d+$/.test(f.name);
                                    return (
                                        // Keyed by position: a new question's name follows its label as it is typed.
                                        <div key={i} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${isLead ? 'bg-brand-50 text-brand' : isCustom ? 'bg-accent-50 text-accent' : 'bg-slate-100 text-slate-500'}`}>{fillsLabel(f.name, custom)}</span>
                                                <span className="ml-auto flex items-center gap-1">
                                                    <Checkbox label="Required" checked={!!f.required} onChange={(v) => setField(i, { required: v })} />
                                                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Up">
                                                        <ArrowUp className="h-4 w-4" />
                                                    </button>
                                                    <button type="button" disabled={i === state.fields.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Down">
                                                        <ArrowDown className="h-4 w-4" />
                                                    </button>
                                                    <button type="button" onClick={() => set({ fields: state.fields.filter((_, fi) => fi !== i) })} className="p-1 text-slate-400 hover:text-red-600" title="Remove">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </span>
                                            </div>
                                            <div className="grid gap-2 sm:grid-cols-[150px_1fr_1fr]">
                                                <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })} disabled={f.name === 'country'}>
                                                    {FIELD_TYPES.map((t) => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.label}
                                                        </option>
                                                    ))}
                                                </Select>
                                                <Input value={f.label} placeholder="Label shown on the form" onChange={(e) => setField(i, { label: e.target.value, ...(isLead || isCustom || form ? {} : { name: slug(e.target.value) }) })} />
                                                <Input value={f.placeholder ?? ''} placeholder="Placeholder (optional)" onChange={(e) => setField(i, { placeholder: e.target.value || null })} />
                                            </div>
                                            {['select', 'radio', 'checkbox'].includes(f.type) && f.name !== 'country' && (
                                                <Input
                                                    placeholder="Options, comma separated (e.g. ERP, CRM, HRMS)"
                                                    value={(f.options ?? []).join(', ')}
                                                    onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Live preview */}
                        <div className="xl:sticky xl:top-0 xl:self-start">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Preview</p>
                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                                <h3 className="text-[17px] font-bold text-slate-800">{state.name || 'Form name'}</h3>
                                {state.fields.map((f, i) => (
                                    <div key={f.name + i}>
                                        <p className="mb-1 text-[12.5px] font-semibold text-slate-600">
                                            {f.label || 'Untitled'} {f.required && <span className="text-red-500">*</span>}
                                        </p>
                                        <div className={`min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-400 ${f.type === 'textarea' ? 'h-16 py-2' : 'py-2'}`}>
                                            {f.type === 'select' ? 'Choose…' : f.type === 'file' ? 'Choose files' : ['radio', 'checkbox'].includes(f.type) ? (f.options ?? []).join(' · ') || 'Options' : f.placeholder || ' '}
                                        </div>
                                    </div>
                                ))}
                                <span className="block rounded-xl px-4 py-2.5 text-center text-[13.5px] font-semibold" style={{ backgroundColor: state.submit_btn_bg_color, color: state.submit_btn_text_color }}>
                                    {state.submit_btn_name || 'Submit'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'info' && (
                    <div className="space-y-4">
                        <FormSection icon={FileText} title="Form Information" bodyClassName="grid gap-4 sm:grid-cols-2">
                            <Field label="Form Name" required>
                                <Input value={state.name} onChange={(e) => set({ name: e.target.value })} />
                            </Field>
                            <Field label="Language" hint="The language of the lead's e-mails.">
                                <Select value={state.language} onChange={(e) => set({ language: e.target.value })}>
                                    <option value="">System Default</option>
                                    {LANGUAGES.map((l) => (
                                        <option key={l} value={l}>
                                            {l}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Lead name prefix" hint="Added before the lead's name, e.g. WEB → “WEB Ravi Patil”.">
                                <Input value={state.lead_name_prefix} onChange={(e) => set({ lead_name_prefix: e.target.value })} />
                            </Field>
                            <Field label="Responsible (Assignee)">
                                <Select value={state.responsible_id} onChange={(e) => set({ responsible_id: e.target.value })}>
                                    <option value="">Nobody</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Status">
                                <Select value={state.lead_status_id} onChange={(e) => set({ lead_status_id: e.target.value })}>
                                    <option value="">Default{lists.defaultStatus ? ` (${lists.defaultStatus.name})` : ''} · Setup → Leads</option>
                                    {lists.statusList.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Source">
                                <Select value={state.lead_source_id} onChange={(e) => set({ lead_source_id: e.target.value })}>
                                    <option value="">Default{lists.defaultSource ? ` (${lists.defaultSource.name})` : ''} · Setup → Leads</option>
                                    {lists.sourceList.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
                                <Checkbox label="Auto mark as public" checked={state.mark_public} onChange={(v) => set({ mark_public: v })} />
                                <Checkbox label="Active (the form accepts submissions)" checked={state.active} onChange={(v) => set({ active: v })} />
                                <Checkbox label="Use Google reCAPTCHA (keys in Setup → reCAPTCHA)" checked={state.recaptcha} onChange={(v) => set({ recaptcha: v })} />
                            </div>
                        </FormSection>

                        <FormSection icon={Settings2} title="Submit button & after submitting" bodyClassName="grid gap-4 sm:grid-cols-3">
                            <Field label="Submit button text">
                                <Input value={state.submit_btn_name} onChange={(e) => set({ submit_btn_name: e.target.value })} />
                            </Field>
                            <Field label="Button background color">
                                <span className="flex items-center gap-2">
                                    <input type="color" value={state.submit_btn_bg_color} onChange={(e) => set({ submit_btn_bg_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" />
                                    <Input value={state.submit_btn_bg_color} onChange={(e) => set({ submit_btn_bg_color: e.target.value })} />
                                </span>
                            </Field>
                            <Field label="Button text color">
                                <span className="flex items-center gap-2">
                                    <input type="color" value={state.submit_btn_text_color} onChange={(e) => set({ submit_btn_text_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" />
                                    <Input value={state.submit_btn_text_color} onChange={(e) => set({ submit_btn_text_color: e.target.value })} />
                                </span>
                            </Field>
                            <div className="sm:col-span-3">
                                <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">After the form is submitted</span>
                                <div className="flex flex-wrap gap-5">
                                    {[
                                        ['message', 'Display thank you message'],
                                        ['redirect', 'Redirect to another website'],
                                    ].map(([value, label]) => (
                                        <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-slate-700">
                                            <input type="radio" name="submit_action" checked={state.submit_action === value} onChange={() => set({ submit_action: value as 'message' | 'redirect' })} />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {state.submit_action === 'message' ? (
                                <Field label="Message to show after the form is submitted" className="sm:col-span-3">
                                    <Textarea rows={2} value={state.success_submit_msg} onChange={(e) => set({ success_submit_msg: e.target.value })} />
                                </Field>
                            ) : (
                                <Field label="Website to redirect to" className="sm:col-span-3">
                                    <Input value={state.submit_redirect_url} onChange={(e) => set({ submit_redirect_url: e.target.value })} placeholder="https://www.yourwebsite.com/thank-you" />
                                </Field>
                            )}
                        </FormSection>

                        <FormSection icon={Copy} title="Duplicates" hint="What to do when the same person sends the form again.">
                            <div className="space-y-3">
                                <Checkbox label="Allow duplicate leads to be inserted into the database" checked={state.allow_duplicate} onChange={(v) => set({ allow_duplicate: v })} />
                                {!state.allow_duplicate && (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label="Prevent duplicate on field">
                                            <Select value={state.track_duplicate_field} onChange={(e) => set({ track_duplicate_field: e.target.value })}>
                                                {DUPLICATE_FIELDS.map((d) => (
                                                    <option key={d.value} value={d.value}>
                                                        {d.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        </Field>
                                        <Field label="+ field (AND)">
                                            <Select value={state.track_duplicate_field_and} onChange={(e) => set({ track_duplicate_field_and: e.target.value })}>
                                                <option value="">Nothing selected</option>
                                                {DUPLICATE_FIELDS.filter((d) => d.value !== state.track_duplicate_field).map((d) => (
                                                    <option key={d.value} value={d.value}>
                                                        {d.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        </Field>
                                        <div className="sm:col-span-2">
                                            <Checkbox label="Create the duplicate form data as a task on the existing lead (assigned to the responsible person)" checked={state.create_task_on_duplicate} onChange={(v) => set({ create_task_on_duplicate: v })} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </FormSection>
                    </div>
                )}

                {tab === 'notify' && (
                    <FormSection icon={Bell} title="Notification settings" hint="Who is told about each new lead from this form.">
                        <div className="space-y-3">
                            <Checkbox label="Notify when lead imported" checked={state.notify_lead_imported} onChange={(v) => set({ notify_lead_imported: v })} />
                            {state.notify_lead_imported && (
                                <>
                                    <div className="flex flex-wrap gap-5">
                                        {[
                                            ['assigned', 'Responsible person'],
                                            ['specific_staff', 'Specific staff members'],
                                        ].map(([value, label]) => (
                                            <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-slate-700">
                                                <input type="radio" name="notify_type" checked={state.notify_type === value} onChange={() => set({ notify_type: value as 'assigned' | 'specific_staff' })} />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    {state.notify_type === 'specific_staff' && <StaffMultiSelect staff={staff} value={state.notify_ids} onChange={(ids) => set({ notify_ids: ids })} />}
                                </>
                            )}
                        </div>
                    </FormSection>
                )}

                {tab === 'code' && form && (
                    <FormSection icon={Code2} title="Integration code" hint="Put the link on your website, or paste the embed code into a page to show the form there.">
                        <div className="space-y-4">
                            <Field label="Form link">
                                <div className="flex gap-2">
                                    <Input readOnly value={publicUrl(form.form_key)} onFocus={(e) => e.target.select()} />
                                    <Button variant="secondary" onClick={() => copy(publicUrl(form.form_key))}>
                                        <Copy className="h-4 w-4" /> Copy
                                    </Button>
                                    <a href={publicUrl(form.form_key)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 hover:bg-slate-50">
                                        <ExternalLink className="h-4 w-4" /> Open
                                    </a>
                                </div>
                            </Field>
                            <Field label="Embed code (iframe)" hint="Change the width and height to fit your page.">
                                <div className="space-y-2">
                                    <Textarea rows={3} readOnly value={embedCode(form.form_key)} onFocus={(e) => e.target.select()} className="font-mono text-[12px]" />
                                    <Button variant="secondary" size="sm" onClick={() => copy(embedCode(form.form_key))}>
                                        <Copy className="h-4 w-4" /> Copy embed code
                                    </Button>
                                </div>
                            </Field>
                        </div>
                    </FormSection>
                )}
            </div>
        </Modal>
    );
}

/**
 * One link per channel (Facebook, Instagram, WhatsApp, ...): a lead that comes through a link gets
 * that channel as its source (added to the sources if missing), whatever the form's own source is.
 */
function ShareLinks({ form, onClose, onCopy }: { form: LeadWebForm; onClose: () => void; onCopy: (text: string) => void }) {
    return (
        <Modal open size="lg" title={`Share "${form.name}"`} onClose={onClose}>
            <div className="space-y-4">
                <p className="text-[13px] text-slate-500">
                    Post the link of each channel there. Leads that come through a link get that channel as their <b>Source</b> (Facebook, Instagram, WhatsApp, …), so you can see where each lead came from.
                    Visitors coming from a Facebook or Instagram post are recognised even with the plain link.
                </p>
                {!form.active && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">This form is inactive: turn it on in the list to accept submissions.</p>}
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                    {CHANNELS.map((ch) => {
                        const url = publicUrl(form.form_key, ch.key);
                        return (
                            <li key={ch.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                                <span className="inline-flex w-36 items-center gap-2 text-[13.5px] font-semibold text-slate-800">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                                    {ch.label}
                                </span>
                                <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1 text-[12px] text-slate-600">{url}</code>
                                <Button size="sm" variant="secondary" onClick={() => onCopy(url)}>
                                    <Copy className="h-3.5 w-3.5" /> Copy
                                </Button>
                            </li>
                        );
                    })}
                </ul>
                <p className="text-[12px] text-slate-400">
                    Running a campaign? Add <code>&amp;campaign=diwali-offer</code> to a link; the campaign is noted on the lead's activity. The embed code (for your website) already marks leads as "Website".
                </p>
            </div>
        </Modal>
    );
}