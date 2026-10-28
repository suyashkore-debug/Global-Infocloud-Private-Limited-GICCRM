import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import RichTextEditor, { type RichTextEditorHandle } from '../../components/editor/RichTextEditor';
import TemplatesPanel from '../../components/editor/TemplatesPanel';
import type { Contract } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

export default function ContractFormPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const editing = !!id;
    const [customers, setCustomers] = useState<{ id: number; name: string }[] | null>(null);
    const [types, setTypes] = useState<{ id: number; name: string }[]>([]);
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const [form, setForm] = useState<Record<string, string | boolean>>({
        subject: '',
        customer_id: params.get('customer_id') ?? '',
        contract_type_id: '',
        project_id: params.get('project_id') ?? '',
        contract_value: '',
        start_date: todayIso(),
        end_date: '',
        description: '',
        content: '',
        trash: false,
        not_visible_to_client: false,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const editor = useRef<RichTextEditorHandle>(null);
    const cf = useCustomFields('contracts', editing ? Number(id) : null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: { id: number; name: string }[] }>('/customers/options').catch(() => ({ data: { data: [] } })),
            api.get<{ data: { id: number; name: string }[] }>('/setup/contract-types'),
            editing ? api.get<{ data: Contract }>(`/contracts/${id}`) : Promise.resolve(null),
        ])
            .then(([c, t, doc]) => {
                setCustomers(c.data.data);
                setTypes(t.data.data);
                if (doc) {
                    const k = doc.data.data;
                    setForm({
                        subject: k.subject,
                        customer_id: String(k.customer?.id ?? ''),
                        contract_type_id: String(k.type?.id ?? ''),
                        project_id: String(k.project?.id ?? ''),
                        contract_value: k.contract_value ?? '',
                        start_date: k.start_date,
                        end_date: k.end_date ?? '',
                        description: k.description ?? '',
                        content: k.content ?? '',
                        trash: k.trash,
                        not_visible_to_client: k.not_visible_to_client,
                    });
                }
            })
            .catch((e) => setError(errorMessage(e)));
    }, [editing, id]);

    useEffect(() => {
        if (!form.customer_id) {
            setProjects([]);
            return;
        }
        api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { customer_id: form.customer_id, status: [1, 2, 3, 4, 5], per_page: 200 } }).then((r) => setProjects(r.data.data));
    }, [form.customer_id]);

    if (!customers) {
        return error ? <ErrorNote message={error} /> : <Spinner />;
    }

    const set = (key: string) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        const payload = {
            ...form,
            customer_id: form.customer_id ? Number(form.customer_id) : null,
            contract_type_id: form.contract_type_id ? Number(form.contract_type_id) : null,
            project_id: form.project_id ? Number(form.project_id) : null,
            contract_value: form.contract_value || null,
            end_date: form.end_date || null,
        };
        try {
            const { data } = editing ? await api.put<{ data: Contract }>(`/contracts/${id}`, payload) : await api.post<{ data: Contract }>('/contracts', payload);
            await cf.save(data.data.id);
            toast('Contract saved.');
            navigate(`/contracts/${data.data.id}`);
        } catch (e) {
            setErrors(fieldErrors(e));
            setError(Object.keys(fieldErrors(e)).length ? null : errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="page-title">{editing ? 'Edit Contract' : 'New Contract'}</h4>
            </div>
            <ErrorNote message={error} />
            <div className="panel_s">
                <div className="panel-body grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-wrap gap-5 sm:col-span-2">
                        <Checkbox label="Trash" checked={!!form.trash} onChange={(v) => setForm({ ...form, trash: v })} />
                        <Checkbox label="Hide from customer" checked={!!form.not_visible_to_client} onChange={(v) => setForm({ ...form, not_visible_to_client: v })} />
                    </div>
                    <Field label="Customer" required error={errors.customer_id}>
                        <Select value={form.customer_id as string} onChange={(e) => setForm({ ...form, customer_id: e.target.value, project_id: '' })}>
                            <option value="">Select</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Project">
                        <Select value={form.project_id as string} onChange={set('project_id')} disabled={!form.customer_id}>
                            <option value="">None</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Subject" required error={errors.subject} className="sm:col-span-2">
                        <Input value={form.subject as string} onChange={set('subject')} />
                    </Field>
                    <Field label="Contract Value" error={errors.contract_value}>
                        <Input type="number" step="any" value={form.contract_value as string} onChange={set('contract_value')} />
                    </Field>
                    <Field label="Contract Type">
                        <Select value={form.contract_type_id as string} onChange={set('contract_type_id')}>
                            <option value="">None</option>
                            {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Start Date" required error={errors.start_date}>
                        <Input type="date" value={form.start_date as string} onChange={set('start_date')} />
                    </Field>
                    <Field label="End Date" error={errors.end_date}>
                        <Input type="date" value={form.end_date as string} onChange={set('end_date')} />
                    </Field>
                    <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                    <Field label="Description" className="sm:col-span-2">
                        <Textarea rows={3} value={form.description as string} onChange={set('description')} />
                    </Field>
                    <div className="sm:col-span-2">
                        <p className="mb-1.5 text-[13.5px] font-medium text-gray-700">Contract Content</p>
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                            <RichTextEditor ref={editor} value={(form.content as string) ?? ''} onChange={(html) => setForm((f) => ({ ...f, content: html }))} placeholder="The full contract text…" minHeight={360} />
                            <TemplatesPanel type="contracts" currentContent={(form.content as string) ?? ''} onInsert={(html) => editor.current?.insertHtml(html)} />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-3">
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
