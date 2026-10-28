import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { emptyLine, ESTIMATE_STATUSES } from '../../lib/sales';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import AddressBox from '../../components/sales/AddressBox';
import SalesItemsEditor, { type MoneyFields } from '../../components/sales/SalesItemsEditor';
import type { Address, CreditNote, Currency, CustomerFull, Estimate, SalesLine } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

type Kind = 'estimate' | 'credit-note';

const CONFIG = {
    estimate: { endpoint: '/estimates', path: '/estimates', title: 'Estimate', dateLabel: 'Estimate Date' },
    'credit-note': { endpoint: '/credit-notes', path: '/credit-notes', title: 'Credit Note', dateLabel: 'Credit Note Date' },
} as const;

const emptyAddress: Address = { street: '', city: '', state: '', zip: '', country: '' };

/**
 * Perfex estimate / credit note form (same layout as the invoice form).
 */
export default function DocumentFormPage({ kind }: { kind: Kind }) {
    const config = CONFIG[kind];
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const editing = !!id;
    const [loading, setLoading] = useState(true);
    const [number, setNumber] = useState('');
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [form, setForm] = useState<Record<string, unknown> | null>(null);
    const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);
    const [moneyFields, setMoneyFields] = useState<MoneyFields>({ discount_type: null, discount_percent: 0, discount_total: 0, adjustment: 0, show_quantity_as: 1 });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields(kind === 'estimate' ? 'estimate' : 'credit_note', editing ? Number(id) : null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: { id: number; name: string }[] }>('/customers/options'),
            api.get<{ data: Currency[] }>('/setup/currencies'),
            editing ? api.get<{ data: Estimate & CreditNote }>(`${config.endpoint}/${id}`) : api.get<{ data: Record<string, string | null> }>(`${config.endpoint}/defaults`),
        ])
            .then(([c, cur, doc]) => {
                setCustomers(c.data.data);
                setCurrencies(cur.data.data);
                if (editing) {
                    const d = doc.data.data as Estimate & CreditNote;
                    setNumber(d.formatted_number);
                    setForm({
                        customer_id: String(d.customer?.id ?? ''),
                        project_id: String(d.project?.id ?? ''),
                        currency_id: String(d.currency?.id ?? ''),
                        date: d.date,
                        expiry_date: d.expiry_date ?? '',
                        status: d.status,
                        reference_no: d.reference_no ?? '',
                        sale_agent_id: String(d.sale_agent?.id ?? ''),
                        billing: { ...emptyAddress, ...d.billing },
                        shipping: { ...emptyAddress, ...d.shipping },
                        include_shipping: d.include_shipping,
                        show_shipping: d.show_shipping,
                        tags: d.tags ?? [],
                        admin_note: d.admin_note ?? '',
                        client_note: d.client_note ?? '',
                        terms: d.terms ?? '',
                    });
                    setLines(d.items?.length ? d.items : [emptyLine()]);
                    setMoneyFields({
                        discount_type: d.discount_type,
                        discount_percent: Number(d.discount_percent),
                        discount_total: Number(d.discount_percent) > 0 ? 0 : Number(d.discount_total),
                        adjustment: Number(d.adjustment),
                        show_quantity_as: d.show_quantity_as,
                    });
                } else {
                    const d = doc.data.data as Record<string, string | null>;
                    setNumber(d.next_number ?? '');
                    setForm({
                        customer_id: params.get('customer_id') ?? '',
                        project_id: params.get('project_id') ?? '',
                        currency_id: String(cur.data.data.find((x) => x.is_default)?.id ?? ''),
                        date: d.date,
                        expiry_date: d.expiry_date ?? '',
                        status: 1,
                        reference_no: '',
                        sale_agent_id: '',
                        billing: emptyAddress,
                        shipping: emptyAddress,
                        include_shipping: false,
                        show_shipping: true,
                        tags: [],
                        admin_note: '',
                        client_note: d.client_note ?? '',
                        terms: d.terms ?? '',
                    });
                }
            })
            .catch((e) => setError(errorMessage(e)))
            .finally(() => setLoading(false));
    }, [editing, id, params, config.endpoint]);

    const customerId = form?.customer_id as string | undefined;
    useEffect(() => {
        if (!customerId) {
            setProjects([]);
            return;
        }
        api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { customer_id: customerId, status: [1, 2, 3, 4, 5], per_page: 200 } }).then((r) => setProjects(r.data.data));
    }, [customerId]);

    if (loading) {
        return <Spinner />;
    }
    if (!form) {
        return <ErrorNote message={error} />;
    }

    const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });
    const str = (key: string) => (form[key] as string) ?? '';

    async function pickCustomer(value: string) {
        setForm((f) => f && { ...f, customer_id: value, project_id: '' });
        if (!value) {
            return;
        }
        try {
            const { data } = await api.get<{ data: CustomerFull }>(`/customers/${value}`);
            const c = data.data;
            setForm((f) =>
                f && {
                    ...f,
                    billing: { street: c.billing.street || c.address, city: c.billing.city || c.city, state: c.billing.state || c.state, zip: c.billing.zip || c.zip, country: c.billing.country || c.country },
                    shipping: { ...emptyAddress, ...c.shipping },
                    currency_id: c.default_currency_id ? String(c.default_currency_id) : f.currency_id,
                },
            );
        } catch {
            // The server fills the address when it cannot be read here.
        }
    }

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        setError(null);
        const billing = form!.billing as Address;
        const shipping = form!.shipping as Address;
        const payload: Record<string, unknown> = {
            estimate_request_id: !id && kind === 'estimate' && params.get('estimate_request_id') ? Number(params.get('estimate_request_id')) : undefined,
            customer_id: form!.customer_id ? Number(form!.customer_id) : null,
            project_id: form!.project_id ? Number(form!.project_id) : null,
            currency_id: form!.currency_id ? Number(form!.currency_id) : null,
            date: form!.date,
            reference_no: form!.reference_no || null,
            ...Object.fromEntries(Object.entries(billing).map(([k, v]) => [`billing_${k}`, v || null])),
            ...Object.fromEntries(Object.entries(shipping).map(([k, v]) => [`shipping_${k}`, v || null])),
            include_shipping: form!.include_shipping,
            show_shipping: form!.show_shipping,
            admin_note: form!.admin_note,
            client_note: form!.client_note,
            terms: form!.terms,
            ...moneyFields,
            items: lines.filter((l) => l.description.trim()),
        };
        if (kind === 'estimate') {
            Object.assign(payload, {
                expiry_date: form!.expiry_date || null,
                status: Number(form!.status),
                sale_agent_id: form!.sale_agent_id ? Number(form!.sale_agent_id) : null,
                tags: form!.tags,
            });
        }
        try {
            const { data } = editing ? await api.put<{ data: { id: number } }>(`${config.endpoint}/${id}`, payload) : await api.post<{ data: { id: number } }>(config.endpoint, payload);
            await cf.save(data.data.id);
            toast(`${config.title} saved.`);
            navigate(`${config.path}/${data.data.id}`);
        } catch (e) {
            const fields = fieldErrors(e);
            setErrors(fields);
            setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const currency = currencies.find((c) => String(c.id) === form.currency_id);

    return (
        <div className="w-full pb-20">
            <div className="mb-4 flex items-center justify-between">
                <h4 className="page-title">{editing ? `Edit ${config.title} ${number}` : `Create New ${config.title}`}</h4>
            </div>
            <ErrorNote message={error} />

            <div className="panel_s mt-3">
                <div className="panel-body grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                        <Field label="Customer" required error={errors.customer_id}>
                            <Select value={str('customer_id')} onChange={(e) => pickCustomer(e.target.value)}>
                                <option value="">Select and begin typing</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        {projects.length > 0 && (
                            <Field label="Project">
                                <Select value={str('project_id')} onChange={(e) => set('project_id', e.target.value)}>
                                    <option value="">None</option>
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <AddressBox title="Bill To" value={form.billing as Address} onChange={(v) => set('billing', v)} />
                            <div>
                                <Checkbox label="Shipping address" checked={!!form.include_shipping} onChange={(v) => set('include_shipping', v)} />
                                {!!form.include_shipping && (
                                    <div className="mt-2 space-y-2">
                                        <AddressBox title="Ship To" value={form.shipping as Address} onChange={(v) => set('shipping', v)} />
                                        <Checkbox label={`Show shipping details in ${config.title.toLowerCase()}`} checked={!!form.show_shipping} onChange={(v) => set('show_shipping', v)} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <Field label={`${config.title} Number`}>
                            <Input value={number} disabled />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={config.dateLabel} required error={errors.date}>
                                <Input type="date" value={str('date')} onChange={(e) => set('date', e.target.value)} />
                            </Field>
                            {kind === 'estimate' && (
                                <Field label="Expiry Date" error={errors.expiry_date}>
                                    <Input type="date" value={str('expiry_date')} min={str('date')} onChange={(e) => set('expiry_date', e.target.value)} />
                                </Field>
                            )}
                        </div>
                    </div>
                    <div className="space-y-4">
                        {kind === 'estimate' && (
                            <Field label="Tags">
                                <TagInput value={form.tags as string[]} onChange={(tags) => set('tags', tags)} />
                            </Field>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Currency">
                                <Select value={str('currency_id')} onChange={(e) => set('currency_id', e.target.value)}>
                                    {currencies.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.symbol})
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            {kind === 'estimate' && (
                                <Field label="Status">
                                    <Select value={String(form.status)} onChange={(e) => set('status', e.target.value)}>
                                        {ESTIMATE_STATUSES.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            <Field label="Reference #" error={errors.reference_no}>
                                <Input value={str('reference_no')} onChange={(e) => set('reference_no', e.target.value)} />
                            </Field>
                            {kind === 'estimate' && (
                                <Field label="Sale Agent">
                                    <Select value={str('sale_agent_id')} onChange={(e) => set('sale_agent_id', e.target.value)}>
                                        <option value="">None</option>
                                        {staff.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.full_name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                        </div>
                        <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                        <Field label="Admin Note">
                            <Textarea rows={3} value={str('admin_note')} onChange={(e) => set('admin_note', e.target.value)} />
                        </Field>
                    </div>
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body">
                    <SalesItemsEditor lines={lines} onLines={setLines} moneyFields={moneyFields} onMoney={setMoneyFields} currency={currency} error={errors.items} />
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body space-y-4">
                    <Field label="Client Note">
                        <Textarea rows={4} value={str('client_note')} onChange={(e) => set('client_note', e.target.value)} />
                    </Field>
                    <Field label="Terms & Conditions">
                        <Textarea rows={5} value={str('terms')} onChange={(e) => set('terms', e.target.value)} />
                    </Field>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-end gap-2 border-t border-gray-200 bg-white px-6 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.05)] lg:left-[230px]">
                <Button onClick={save} loading={saving}>
                    Save
                </Button>
            </div>
        </div>
    );
}
