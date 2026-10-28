import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { RECURRING_TYPES } from '../../lib/constants';
import { emptyLine } from '../../lib/sales';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import AddressBox from '../../components/sales/AddressBox';
import SalesItemsEditor, { type MoneyFields } from '../../components/sales/SalesItemsEditor';
import type { Address, Currency, CustomerFull, Invoice, PaymentMode, SalesLine } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

const emptyAddress: Address = { street: '', city: '', state: '', zip: '', country: '' };

interface FormState {
    customer_id: string;
    project_id: string;
    currency_id: string;
    date: string;
    due_date: string;
    sale_agent_id: string;
    billing: Address;
    shipping: Address;
    include_shipping: boolean;
    show_shipping_on_invoice: boolean;
    allowed_payment_modes: number[];
    tags: string[];
    repeat_every: string;
    recurring_type: string;
    cycles: string;
    infinity: boolean;
    cancel_overdue_reminders: boolean;
    admin_note: string;
    client_note: string;
    terms: string;
}

export default function InvoiceFormPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const editing = !!id;
    const [loading, setLoading] = useState(true);
    const [number, setNumber] = useState('');
    const [isDraft, setIsDraft] = useState(false);
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [modes, setModes] = useState<PaymentMode[]>([]);
    const [form, setForm] = useState<FormState | null>(null);
    const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);
    const [moneyFields, setMoneyFields] = useState<MoneyFields>({ discount_type: null, discount_percent: 0, discount_total: 0, adjustment: 0, show_quantity_as: 1 });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<'draft' | 'save' | null>(null);
    const cf = useCustomFields('invoice', editing ? Number(id) : null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: { id: number; name: string }[] }>('/customers/options'),
            api.get<{ data: Currency[] }>('/setup/currencies'),
            api.get<{ data: PaymentMode[] }>('/setup/payment-modes'),
            editing ? api.get<{ data: Invoice }>(`/invoices/${id}`) : api.get<{ data: Record<string, unknown> }>('/invoices/defaults'),
        ])
            .then(([c, cur, pm, doc]) => {
                setCustomers(c.data.data);
                setCurrencies(cur.data.data);
                setModes(pm.data.data.filter((m) => m.active && !m.expenses_only));
                if (editing) {
                    const inv = doc.data.data as unknown as Invoice;
                    setNumber(inv.formatted_number);
                    setIsDraft(inv.status === 6);
                    setForm({
                        customer_id: String(inv.customer?.id ?? ''),
                        project_id: String(inv.project?.id ?? ''),
                        currency_id: String(inv.currency?.id ?? ''),
                        date: inv.date,
                        due_date: inv.due_date ?? '',
                        sale_agent_id: String(inv.sale_agent?.id ?? ''),
                        billing: { ...emptyAddress, ...inv.billing },
                        shipping: { ...emptyAddress, ...inv.shipping },
                        include_shipping: inv.include_shipping,
                        show_shipping_on_invoice: inv.show_shipping_on_invoice,
                        allowed_payment_modes: inv.allowed_payment_modes,
                        tags: inv.tags ?? [],
                        repeat_every: inv.repeat_every ? String(inv.repeat_every) : '',
                        recurring_type: inv.recurring_type ?? 'month',
                        cycles: inv.cycles ? String(inv.cycles) : '',
                        infinity: !inv.cycles,
                        cancel_overdue_reminders: inv.cancel_overdue_reminders,
                        admin_note: inv.admin_note ?? '',
                        client_note: inv.client_note ?? '',
                        terms: inv.terms ?? '',
                    });
                    setLines(inv.items?.length ? inv.items : [emptyLine()]);
                    setMoneyFields({
                        discount_type: inv.discount_type,
                        discount_percent: Number(inv.discount_percent),
                        discount_total: Number(inv.discount_percent) > 0 ? 0 : Number(inv.discount_total),
                        adjustment: Number(inv.adjustment),
                        show_quantity_as: inv.show_quantity_as,
                    });
                } else {
                    const d = doc.data.data as { next_number: string; date: string; due_date: string | null; terms: string; client_note: string; allowed_payment_modes: number[] };
                    setNumber(d.next_number);
                    setForm({
                        customer_id: params.get('customer_id') ?? '',
                        project_id: params.get('project_id') ?? '',
                        currency_id: String(cur.data.data.find((x) => x.is_default)?.id ?? ''),
                        date: d.date,
                        due_date: d.due_date ?? '',
                        sale_agent_id: '',
                        billing: emptyAddress,
                        shipping: emptyAddress,
                        include_shipping: false,
                        show_shipping_on_invoice: true,
                        allowed_payment_modes: d.allowed_payment_modes,
                        tags: [],
                        repeat_every: '',
                        recurring_type: 'month',
                        cycles: '',
                        infinity: true,
                        cancel_overdue_reminders: false,
                        admin_note: '',
                        client_note: d.client_note,
                        terms: d.terms,
                    });
                }
            })
            .catch((e) => setError(errorMessage(e)))
            .finally(() => setLoading(false));
    }, [editing, id, params]);

    // Picking a customer fills the addresses, currency and its projects, as Perfex does.
    useEffect(() => {
        if (!form?.customer_id) {
            setProjects([]);
            return;
        }
        api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { customer_id: form.customer_id, status: [1, 2, 3, 4, 5], per_page: 200 } }).then((r) => setProjects(r.data.data));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form?.customer_id]);

    async function pickCustomer(customerId: string) {
        if (!form) {
            return;
        }
        setForm({ ...form, customer_id: customerId, project_id: '' });
        if (!customerId) {
            return;
        }
        try {
            const { data } = await api.get<{ data: CustomerFull }>(`/customers/${customerId}`);
            const c = data.data;
            setForm((f) =>
                f && {
                    ...f,
                    customer_id: customerId,
                    project_id: '',
                    billing: { street: c.billing.street || c.address, city: c.billing.city || c.city, state: c.billing.state || c.state, zip: c.billing.zip || c.zip, country: c.billing.country || c.country },
                    shipping: { ...emptyAddress, ...c.shipping },
                    currency_id: c.default_currency_id ? String(c.default_currency_id) : f.currency_id,
                },
            );
        } catch {
            // Without customers.view the addresses are left for the server to fill.
        }
    }

    async function save(asDraft: boolean) {
        if (!form) {
            return;
        }
        if (!cf.validate()) {
            return;
        }
        setSaving(asDraft ? 'draft' : 'save');
        setErrors({});
        setError(null);
        const payload = {
            customer_id: form.customer_id ? Number(form.customer_id) : null,
            project_id: form.project_id ? Number(form.project_id) : null,
            currency_id: form.currency_id ? Number(form.currency_id) : null,
            date: form.date,
            due_date: form.due_date || null,
            sale_agent_id: form.sale_agent_id ? Number(form.sale_agent_id) : null,
            ...Object.fromEntries(Object.entries(form.billing).map(([k, v]) => [`billing_${k}`, v || null])),
            ...Object.fromEntries(Object.entries(form.shipping).map(([k, v]) => [`shipping_${k}`, v || null])),
            include_shipping: form.include_shipping,
            show_shipping_on_invoice: form.show_shipping_on_invoice,
            allowed_payment_modes: form.allowed_payment_modes,
            tags: form.tags,
            repeat_every: form.repeat_every ? Number(form.repeat_every) : null,
            recurring_type: form.repeat_every ? form.recurring_type : null,
            cycles: form.repeat_every && !form.infinity ? Number(form.cycles || 0) : 0,
            cancel_overdue_reminders: form.cancel_overdue_reminders,
            admin_note: form.admin_note,
            client_note: form.client_note,
            terms: form.terms,
            ...moneyFields,
            items: lines.filter((l) => l.description.trim()),
            save_as_draft: asDraft,
        };
        try {
            const { data } = editing ? await api.put<{ data: Invoice }>(`/invoices/${id}`, payload) : await api.post<{ data: Invoice }>('/invoices', payload);
            await cf.save(data.data.id);
            toast(editing ? 'Invoice updated.' : 'Invoice created.');
            navigate(`/invoices/${data.data.id}`);
        } catch (e) {
            const fields = fieldErrors(e);
            setErrors(fields);
            setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(e));
        } finally {
            setSaving(null);
        }
    }

    if (loading) {
        return <Spinner />;
    }
    if (!form) {
        return <ErrorNote message={error} />;
    }

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
    const currency = currencies.find((c) => String(c.id) === form.currency_id);

    return (
        <div className="w-full pb-20">
            <div className="mb-4 flex items-center justify-between">
                <h4 className="page-title">{editing ? `Edit Invoice ${number}` : 'Create New Invoice'}</h4>
            </div>
            <ErrorNote message={error} />

            <div className="panel_s mt-3">
                <div className="panel-body grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                        <Field label="Customer" required error={errors.customer_id}>
                            <Select value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
                                <option value="">Select and begin typing</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        {projects.length > 0 && (
                            <Field label="Project" error={errors.project_id}>
                                <Select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
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
                            <AddressBox title="Bill To" value={form.billing} onChange={(billing) => set('billing', billing)} />
                            <div>
                                <Checkbox label="Shipping address" checked={form.include_shipping} onChange={(v) => set('include_shipping', v)} />
                                {form.include_shipping && (
                                    <div className="mt-2 space-y-2">
                                        <AddressBox title="Ship To" value={form.shipping} onChange={(shipping) => set('shipping', shipping)} />
                                        <Checkbox label="Show shipping details in invoice" checked={form.show_shipping_on_invoice} onChange={(v) => set('show_shipping_on_invoice', v)} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <Field label="Invoice Number">
                            <Input value={isDraft ? `${number} (assigned when saved, not as draft)` : number} disabled />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Invoice Date" required error={errors.date}>
                                <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
                            </Field>
                            <Field label="Due Date" error={errors.due_date}>
                                <Input type="date" value={form.due_date} min={form.date} onChange={(e) => set('due_date', e.target.value)} />
                            </Field>
                        </div>
                        <Checkbox label="Prevent sending overdue reminders for this invoice" checked={form.cancel_overdue_reminders} onChange={(v) => set('cancel_overdue_reminders', v)} />
                    </div>

                    <div className="space-y-4">
                        <Field label="Tags">
                            <TagInput value={form.tags} onChange={(tags) => set('tags', tags)} />
                        </Field>
                        <Field label="Allowed payment modes for this invoice" error={errors.allowed_payment_modes}>
                            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-gray-200 p-3">
                                {modes.length === 0 && <span className="text-xs text-gray-500">No payment modes yet (Setup → Payment Modes).</span>}
                                {modes.map((m) => (
                                    <Checkbox
                                        key={m.id}
                                        label={m.name}
                                        checked={form.allowed_payment_modes.includes(m.id)}
                                        onChange={(on) => set('allowed_payment_modes', on ? [...form.allowed_payment_modes, m.id] : form.allowed_payment_modes.filter((x) => x !== m.id))}
                                    />
                                ))}
                            </div>
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Currency" error={errors.currency_id}>
                                <Select value={form.currency_id} onChange={(e) => set('currency_id', e.target.value)}>
                                    {currencies.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.symbol})
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Sale Agent" error={errors.sale_agent_id}>
                                <Select value={form.sale_agent_id} onChange={(e) => set('sale_agent_id', e.target.value)}>
                                    <option value="">None</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Recurring Invoice?" error={errors.repeat_every}>
                                <div className="flex gap-2">
                                    <Input type="number" min={1} placeholder="No" value={form.repeat_every} onChange={(e) => set('repeat_every', e.target.value)} className="w-20" />
                                    <Select value={form.recurring_type} onChange={(e) => set('recurring_type', e.target.value)} disabled={!form.repeat_every}>
                                        {RECURRING_TYPES.map((r) => (
                                            <option key={r.id} value={r.id}>
                                                {r.name}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            </Field>
                            {form.repeat_every && (
                                <Field label="Total Cycles">
                                    <div className="flex items-center gap-3">
                                        <Input type="number" min={1} value={form.cycles} disabled={form.infinity} onChange={(e) => set('cycles', e.target.value)} className="w-20" />
                                        <Checkbox label="Infinity" checked={form.infinity} onChange={(v) => set('infinity', v)} />
                                    </div>
                                </Field>
                            )}
                        </div>
                        <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                        <Field label="Admin Note">
                            <Textarea rows={3} value={form.admin_note} onChange={(e) => set('admin_note', e.target.value)} />
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
                        <Textarea rows={4} value={form.client_note} onChange={(e) => set('client_note', e.target.value)} />
                    </Field>
                    <Field label="Terms & Conditions">
                        <Textarea rows={5} value={form.terms} onChange={(e) => set('terms', e.target.value)} />
                    </Field>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-end gap-2 border-t border-gray-200 bg-white px-6 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.05)] lg:left-[230px]">
                {(!editing || isDraft) && (
                    <Button variant="secondary" onClick={() => save(true)} loading={saving === 'draft'}>
                        Save as Draft
                    </Button>
                )}
                <Button onClick={() => save(false)} loading={saving === 'save'}>
                    Save
                </Button>
            </div>
        </div>
    );
}
