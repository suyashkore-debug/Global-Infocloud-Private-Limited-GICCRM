import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, EmptyState, ErrorNote, Field, Input, Modal, Select, Spinner, StaffMultiSelect, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { FieldType, FormField, QuoteForm, RequestStatus } from './types';

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

const DEFAULT_FIELDS: FormField[] = [
    { type: 'text', name: 'company', label: 'Company', required: true },
    { type: 'text', name: 'first_name', label: 'Name', required: true },
    { type: 'email', name: 'email', label: 'Email', required: true },
    { type: 'text', name: 'phone', label: 'Phone' },
    { type: 'textarea', name: 'message', label: 'Describe your requirement', required: true },
    { type: 'file', name: 'files', label: 'Attachments' },
];

const publicUrl = (key: string) => `${window.location.origin}/forms/quote/${key}`;

/** Perfex Estimate Request → Forms: build the public web forms and copy their link / embed code. */
export default function FormsPage() {
    const { user } = useAuth();
    const toast = useToast();
    const { data, reload } = useApi<{ data: QuoteForm[] }>(user?.is_admin ? '/estimate-request-forms' : null);
    const [editing, setEditing] = useState<QuoteForm | 'new' | null>(null);

    if (!user?.is_admin) {
        return <Navigate to="/estimate-requests" replace />;
    }

    async function remove(form: QuoteForm) {
        if (!confirm(`Delete the form "${form.name}"? Requests already received are kept.`)) {
            return;
        }
        await api.delete(`/estimate-request-forms/${form.id}`);
        reload();
    }

    const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied.'));

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center gap-2">
                <Link to="/estimate-requests" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">Estimate Request Forms</h4>
                <Button onClick={() => setEditing('new')}>
                    <Plus className="h-4 w-4" /> New Form
                </Button>
            </div>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No forms yet" text="Create a form and put its link on your website to collect estimate requests." />
            ) : (
                <div className="panel_s overflow-x-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th className="text-right">Requests</th>
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
                                        <button type="button" onClick={() => setEditing(f)} className="font-medium text-blue-600 hover:underline">
                                            {f.name}
                                        </button>
                                    </td>
                                    <td className="text-right">{f.requests_count ?? 0}</td>
                                    <td>{f.active ? 'Yes' : 'No'}</td>
                                    <td>{formatDate(f.created_at)}</td>
                                    <td>
                                        <div className="flex flex-wrap gap-3 text-xs">
                                            <a href={publicUrl(f.form_key)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                                Open
                                            </a>
                                            <button type="button" onClick={() => copy(publicUrl(f.form_key))} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
                                                <Copy className="h-3 w-3" /> Link
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => copy(`<iframe width="600" height="850" src="${publicUrl(f.form_key)}" frameborder="0" allowfullscreen></iframe>`)}
                                                className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                                            >
                                                <Copy className="h-3 w-3" /> Embed code
                                            </button>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <button type="button" onClick={() => remove(f)} className="text-gray-400 hover:text-red-600" title="Delete">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {editing && (
                <FormEditor
                    form={editing === 'new' ? null : editing}
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

const slug = (label: string) =>
    label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'field';

function FormEditor({ form, onClose, onSaved }: { form: QuoteForm | null; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const staff = useStaff();
    const { data: statuses } = useApi<{ data: RequestStatus[] }>('/setup/estimate-request-statuses');
    const [state, setState] = useState({
        name: form?.name ?? '',
        fields: form?.fields ?? DEFAULT_FIELDS,
        estimate_request_status_id: String(form?.estimate_request_status_id ?? ''),
        responsible_id: String(form?.responsible_id ?? ''),
        submit_btn_name: form?.submit_btn_name ?? 'Submit',
        success_submit_msg: form?.success_submit_msg ?? 'Thank you! Your request has been received. We will get back to you soon.',
        notify_request_submitted: form?.notify_request_submitted ?? false,
        notify_type: form?.notify_type ?? 'specific_staff',
        notify_ids: form?.notify_ids ?? [],
        active: form?.active ?? true,
    });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
    const setField = (i: number, patch: Partial<FormField>) => set({ fields: state.fields.map((f, fi) => (fi === i ? { ...f, ...patch } : f)) });
    const move = (i: number, dir: -1 | 1) => {
        const next = [...state.fields];
        [next[i], next[i + dir]] = [next[i + dir], next[i]];
        set({ fields: next });
    };

    async function save() {
        setSaving(true);
        setError(null);
        const body = {
            ...state,
            estimate_request_status_id: state.estimate_request_status_id ? Number(state.estimate_request_status_id) : null,
            responsible_id: state.responsible_id ? Number(state.responsible_id) : null,
            notify_type: state.notify_request_submitted ? state.notify_type : null,
        };
        try {
            await (form ? api.put(`/estimate-request-forms/${form.id}`, body) : api.post('/estimate-request-forms', body));
            toast('Form saved.');
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
            size="xl"
            title={form ? `Edit form: ${form.name}` : 'New Estimate Request Form'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!state.name.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                <ErrorNote message={error} />
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Form Name" required>
                        <Input value={state.name} onChange={(e) => set({ name: e.target.value })} />
                    </Field>
                    <Field label="Submit button text">
                        <Input value={state.submit_btn_name} onChange={(e) => set({ submit_btn_name: e.target.value })} />
                    </Field>
                    <Field label="Status of new requests">
                        <Select value={state.estimate_request_status_id} onChange={(e) => set({ estimate_request_status_id: e.target.value })}>
                            <option value="">Processing (default)</option>
                            {statuses?.data.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Responsible (auto assign)">
                        <Select value={state.responsible_id} onChange={(e) => set({ responsible_id: e.target.value })}>
                            <option value="">Nobody</option>
                            {staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.full_name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Message to show after the form is submitted" className="sm:col-span-2">
                        <Textarea rows={2} value={state.success_submit_msg} onChange={(e) => set({ success_submit_msg: e.target.value })} />
                    </Field>
                    <div className="space-y-2 sm:col-span-2">
                        <Checkbox label="Notify when a request is submitted" checked={state.notify_request_submitted} onChange={(v) => set({ notify_request_submitted: v })} />
                        {state.notify_request_submitted && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Select value={state.notify_type} onChange={(e) => set({ notify_type: e.target.value as 'specific_staff' | 'assigned' })}>
                                    <option value="specific_staff">Specific staff members</option>
                                    <option value="assigned">Responsible person</option>
                                </Select>
                                {state.notify_type === 'specific_staff' && <StaffMultiSelect staff={staff} value={state.notify_ids} onChange={(ids) => set({ notify_ids: ids })} />}
                            </div>
                        )}
                    </div>
                    <Checkbox label="Active (form accepts submissions)" checked={state.active} onChange={(v) => set({ active: v })} />
                </div>

                <div className="space-y-2">
                    <h5 className="text-[15px] font-semibold">Fields</h5>
                    <p className="text-xs text-gray-500">An Email field is always required (it's added automatically if missing).</p>
                    {state.fields.map((f, i) => (
                        <div key={i} className="grid items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[130px_1fr_1fr_auto]">
                            <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
                                {FIELD_TYPES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.label}
                                    </option>
                                ))}
                            </Select>
                            <Input value={f.label} placeholder="Label" onChange={(e) => setField(i, { label: e.target.value, ...(form ? {} : { name: f.name === 'email' ? 'email' : slug(e.target.value) }) })} />
                            <Input value={f.name} placeholder="field_name" onChange={(e) => setField(i, { name: slug(e.target.value) })} />
                            <div className="flex items-center gap-1">
                                <Checkbox label="Req." checked={!!f.required} onChange={(v) => setField(i, { required: v })} />
                                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Up">
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                                <button type="button" disabled={i === state.fields.length - 1} onClick={() => move(i, 1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Down">
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => set({ fields: state.fields.filter((_, fi) => fi !== i) })} className="p-1 text-gray-400 hover:text-red-600" title="Remove">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            {['select', 'radio', 'checkbox'].includes(f.type) && (
                                <Input
                                    className="sm:col-span-4"
                                    placeholder="Options, comma separated (e.g. ERP, CRM, HRMS)"
                                    value={(f.options ?? []).join(', ')}
                                    onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                                />
                            )}
                        </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={() => set({ fields: [...state.fields, { type: 'text', name: `field_${state.fields.length + 1}`, label: '' }] })}>
                        <Plus className="h-4 w-4" /> Add field
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
