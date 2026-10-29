import { useEffect, useRef, useState } from 'react';
import { FileSignature, ListOrdered, NotebookPen, Send } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { PROPOSAL_STATUSES } from '../../lib/sales';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, FormSection, Input, SectionHeading, Select, Spinner, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import RichTextEditor, { type RichTextEditorHandle } from '../../components/editor/RichTextEditor';
import TemplatesPanel from '../../components/editor/TemplatesPanel';
import SalesItemsEditor, { type MoneyFields } from '../../components/sales/SalesItemsEditor';
import type { Currency, CustomerFull, Proposal, SalesLine } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

const TO_FIELDS = ['proposal_to', 'address', 'city', 'state', 'zip', 'country', 'email', 'phone'] as const;

/** Perfex proposal form: who it is for, the proposal text, then priced items. */
export default function ProposalFormPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const editing = !!id;
    const [loading, setLoading] = useState(true);
    const editor = useRef<RichTextEditorHandle>(null);
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [form, setForm] = useState<Record<string, string | boolean | string[]> | null>(null);
    const [lines, setLines] = useState<SalesLine[]>([]);
    const [moneyFields, setMoneyFields] = useState<MoneyFields>({ discount_type: null, discount_percent: 0, discount_total: 0, adjustment: 0, show_quantity_as: 1 });
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const customerForProjects = (form?.customer_id as string | undefined) ?? '';
    useEffect(() => {
        if (!customerForProjects) {
            setProjects([]);
            return;
        }
        api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { customer_id: customerForProjects, status: [1, 2, 3, 4, 5], per_page: 200 } }).then((r) => setProjects(r.data.data));
    }, [customerForProjects]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('proposal', editing ? Number(id) : null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: { id: number; name: string }[] }>('/customers/options'),
            api.get<{ data: Currency[] }>('/setup/currencies'),
            editing ? api.get<{ data: Proposal }>(`/proposals/${id}`) : api.get<{ data: { date: string; open_till: string | null } }>('/proposals/defaults'),
        ])
            .then(([c, cur, doc]) => {
                setCustomers(c.data.data);
                setCurrencies(cur.data.data);
                if (editing) {
                    const p = doc.data.data as Proposal;
                    setForm({
                        subject: p.subject,
                        content: p.content ?? '',
                        customer_id: String(p.customer?.id ?? ''),
                        project_id: String(p.project?.id ?? ''),
                        lead_id: String(p.lead?.id ?? ''),
                        currency_id: String(p.currency?.id ?? ''),
                        date: p.date,
                        open_till: p.open_till ?? '',
                        status: String(p.status),
                        assigned_id: String(p.assigned?.id ?? ''),
                        allow_comments: p.allow_comments,
                        tags: p.tags ?? [],
                        ...Object.fromEntries(TO_FIELDS.map((f) => [f, (p[f] as string | null) ?? ''])),
                    });
                    setLines(p.items ?? []);
                    setMoneyFields({
                        discount_type: p.discount_type,
                        discount_percent: Number(p.discount_percent),
                        discount_total: Number(p.discount_percent) > 0 ? 0 : Number(p.discount_total),
                        adjustment: Number(p.adjustment),
                        show_quantity_as: p.show_quantity_as,
                    });
                } else {
                    const d = doc.data.data as { date: string; open_till: string | null };
                    setForm({
                        subject: '',
                        content: '',
                        customer_id: params.get('customer_id') ?? '',
                        project_id: params.get('project_id') ?? '',
                        lead_id: params.get('lead_id') ?? '',
                        currency_id: String(cur.data.data.find((x) => x.is_default)?.id ?? ''),
                        date: d.date,
                        open_till: d.open_till ?? '',
                        status: '6',
                        assigned_id: '',
                        allow_comments: true,
                        tags: [],
                        ...Object.fromEntries(TO_FIELDS.map((f) => [f, ''])),
                    });
                }
            })
            .catch((e) => setError(errorMessage(e)))
            .finally(() => setLoading(false));
    }, [editing, id, params]);

    if (loading) {
        return <Spinner />;
    }
    if (!form) {
        return <ErrorNote message={error} />;
    }

    const set = (key: string, value: string | boolean | string[]) => setForm({ ...form, [key]: value });
    const str = (key: string) => (form[key] as string) ?? '';

    async function pickCustomer(value: string) {
        set('customer_id', value);
        if (!value) {
            return;
        }
        try {
            const { data } = await api.get<{ data: CustomerFull }>(`/customers/${value}`);
            const c = data.data;
            setForm((f) =>
                f && {
                    ...f,
                    customer_id: value,
                    project_id: '',
                    proposal_to: c.name,
                    address: c.billing.street || c.address || '',
                    city: c.billing.city || c.city || '',
                    state: c.billing.state || c.state || '',
                    zip: c.billing.zip || c.zip || '',
                    country: c.billing.country || c.country || '',
                    email: c.primary_contact?.email ?? c.email ?? '',
                    phone: c.primary_contact?.phone ?? c.phone ?? '',
                    currency_id: c.default_currency_id ? String(c.default_currency_id) : (f.currency_id as string),
                },
            );
        } catch {
            // The server fills these from the customer when left empty.
        }
    }

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        setError(null);
        const payload = {
            ...form,
            estimate_request_id: !id && params.get('estimate_request_id') ? Number(params.get('estimate_request_id')) : undefined,
            customer_id: form!.customer_id ? Number(form!.customer_id) : null,
            project_id: form!.customer_id && form!.project_id ? Number(form!.project_id) : null,
            lead_id: form!.lead_id ? Number(form!.lead_id) : null,
            currency_id: form!.currency_id ? Number(form!.currency_id) : null,
            assigned_id: form!.assigned_id ? Number(form!.assigned_id) : null,
            status: Number(form!.status),
            open_till: form!.open_till || null,
            ...moneyFields,
            items: lines.filter((l) => l.description.trim()),
        };
        try {
            const { data } = editing ? await api.put<{ data: Proposal }>(`/proposals/${id}`, payload) : await api.post<{ data: Proposal }>('/proposals', payload);
            await cf.save(data.data.id);
            toast('Proposal saved.');
            navigate(`/proposals/${data.data.id}`);
        } catch (e) {
            const fields = fieldErrors(e);
            setErrors(fields);
            setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const currency = currencies.find((c) => String(c.id) === str('currency_id'));

    return (
        <div className="w-full pb-20">
            <div className="mb-4 flex items-center justify-between">
                <h4 className="page-title">{editing ? 'Edit Proposal' : 'New Proposal'}</h4>
            </div>
            <ErrorNote message={error} />

            <div className="panel_s mt-3">
                <div className="panel-body grid gap-4 lg:grid-cols-2">
                    <FormSection icon={FileSignature} title="Proposal details" hint="What you are proposing, to whom and until when." bodyClassName="space-y-4">
                        <Field label="Subject" required error={errors.subject}>
                            <Input value={str('subject')} onChange={(e) => set('subject', e.target.value)} autoFocus />
                        </Field>
                        <Field label="Related (Customer)" error={errors.customer_id}>
                            <Select value={str('customer_id')} onChange={(e) => pickCustomer(e.target.value)}>
                                <option value="">Not a customer yet</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        {str('customer_id') && (
                            <Field label="Project">
                                <Select value={str('project_id')} onChange={(e) => set('project_id', e.target.value)}>
                                    <option value="">None</option>
                                    {projects.map((pr) => (
                                        <option key={pr.id} value={pr.id}>
                                            {pr.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Date" required error={errors.date}>
                                <Input type="date" value={str('date')} onChange={(e) => set('date', e.target.value)} />
                            </Field>
                            <Field label="Open Till" error={errors.open_till}>
                                <Input type="date" value={str('open_till')} onChange={(e) => set('open_till', e.target.value)} />
                            </Field>
                            <Field label="Currency">
                                <Select value={str('currency_id')} onChange={(e) => set('currency_id', e.target.value)}>
                                    {currencies.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.symbol})
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Status">
                                <Select value={str('status')} onChange={(e) => set('status', e.target.value)}>
                                    {PROPOSAL_STATUSES.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Assigned">
                                <Select value={str('assigned_id')} onChange={(e) => set('assigned_id', e.target.value)}>
                                    <option value="">None</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                        <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                        <Field label="Tags">
                            <TagInput value={form.tags as string[]} onChange={(tags) => set('tags', tags)} />
                        </Field>
                        <Checkbox label="Allow Comments" checked={!!form.allow_comments} onChange={(v) => set('allow_comments', v)} />
                    </FormSection>
                    <FormSection icon={Send} title="Send to" hint="The recipient's details printed on the proposal." bodyClassName="grid content-start gap-4 sm:grid-cols-2">
                        {form.lead_id && !form.customer_id && <p className="text-[13px] text-gray-600 sm:col-span-2">Related to lead #{str('lead_id')} (details are filled from the lead when left empty).</p>}
                        <Field label="To" required={!form.customer_id && !form.lead_id} error={errors.proposal_to} className="sm:col-span-2">
                            <Input value={str('proposal_to')} onChange={(e) => set('proposal_to', e.target.value)} />
                        </Field>
                        <Field label="Address" className="sm:col-span-2">
                            <Textarea rows={2} value={str('address')} onChange={(e) => set('address', e.target.value)} />
                        </Field>
                        <Field label="City">
                            <Input value={str('city')} onChange={(e) => set('city', e.target.value)} />
                        </Field>
                        <Field label="State">
                            <Input value={str('state')} onChange={(e) => set('state', e.target.value)} />
                        </Field>
                        <Field label="Country">
                            <Input value={str('country')} onChange={(e) => set('country', e.target.value)} />
                        </Field>
                        <Field label="Zip Code">
                            <Input value={str('zip')} onChange={(e) => set('zip', e.target.value)} />
                        </Field>
                        <Field label="Email" error={errors.email}>
                            <Input type="email" value={str('email')} onChange={(e) => set('email', e.target.value)} />
                        </Field>
                        <Field label="Phone">
                            <Input value={str('phone')} onChange={(e) => set('phone', e.target.value)} />
                        </Field>
                    </FormSection>
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body">
                    <SectionHeading icon={NotebookPen} title="Proposal content" hint="Introduction, scope and timelines. Insert a template from the right." />
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                        <RichTextEditor ref={editor} value={str('content')} onChange={(html) => set('content', html)} placeholder="Introduction, scope of work, timelines…" />
                        <TemplatesPanel type="proposals" currentContent={str('content')} onInsert={(html) => editor.current?.insertHtml(html)} />
                    </div>
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body">
                    <SectionHeading icon={ListOrdered} title="Items" hint="What you are offering, with quantities, rates and taxes." />
                    <SalesItemsEditor lines={lines.length ? lines : []} onLines={setLines} moneyFields={moneyFields} onMoney={setMoneyFields} currency={currency} error={errors.items} />
                </div>
            </div>

            <div className="form-actions-bar">
                <Button onClick={save} loading={saving}>
                    Save
                </Button>
            </div>
        </div>
    );
}
