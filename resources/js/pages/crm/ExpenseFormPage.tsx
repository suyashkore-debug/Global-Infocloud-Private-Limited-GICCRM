import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { RECURRING_TYPES } from '../../lib/constants';
import { todayIso } from '../../lib/format';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Currency, Expense, PaymentMode, Tax } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

/** Perfex "Record Expense" form. */
export default function ExpenseFormPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const editing = !!id;
    const [lists, setLists] = useState<{ categories: { id: number; name: string }[]; customers: { id: number; name: string }[]; currencies: Currency[]; taxes: Tax[]; modes: PaymentMode[] } | null>(null);
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const [form, setForm] = useState<Record<string, string | boolean>>({
        expense_category_id: '',
        name: '',
        amount: '',
        date: todayIso(),
        customer_id: params.get('customer_id') ?? '',
        project_id: params.get('project_id') ?? '',
        billable: false,
        currency_id: '',
        tax_id: '',
        tax2_id: '',
        payment_mode_id: '',
        reference_no: '',
        note: '',
        repeat_every: '',
        recurring_type: 'month',
        cycles: '',
        create_invoice_billable: false,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('expenses', editing ? Number(id) : null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: { id: number; name: string }[] }>('/setup/expense-categories'),
            api.get<{ data: { id: number; name: string }[] }>('/customers/options').catch(() => ({ data: { data: [] } })),
            api.get<{ data: Currency[] }>('/setup/currencies'),
            api.get<{ data: Tax[] }>('/setup/taxes'),
            api.get<{ data: PaymentMode[] }>('/setup/payment-modes'),
            editing ? api.get<{ data: Expense }>(`/expenses/${id}`) : Promise.resolve(null),
        ])
            .then(([cat, cus, cur, tax, pm, doc]) => {
                setLists({ categories: cat.data.data, customers: cus.data.data, currencies: cur.data.data, taxes: tax.data.data, modes: pm.data.data.filter((m) => m.active && !m.invoices_only) });
                if (doc) {
                    const e = doc.data.data;
                    setForm({
                        expense_category_id: String(e.category?.id ?? ''),
                        name: e.name ?? '',
                        amount: e.amount,
                        date: e.date,
                        customer_id: String(e.customer?.id ?? ''),
                        project_id: String(e.project?.id ?? ''),
                        billable: e.billable,
                        currency_id: String(e.currency?.id ?? ''),
                        tax_id: String(e.tax?.id ?? ''),
                        tax2_id: String(e.tax2?.id ?? ''),
                        payment_mode_id: String(e.payment_mode?.id ?? ''),
                        reference_no: e.reference_no ?? '',
                        note: e.note ?? '',
                        repeat_every: e.repeat_every ? String(e.repeat_every) : '',
                        recurring_type: e.recurring_type ?? 'month',
                        cycles: e.cycles ? String(e.cycles) : '',
                        create_invoice_billable: e.create_invoice_billable,
                    });
                } else {
                    setForm((f) => ({ ...f, currency_id: String(cur.data.data.find((c) => c.is_default)?.id ?? '') }));
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

    if (!lists) {
        return error ? <ErrorNote message={error} /> : <Spinner />;
    }

    const set = (key: string) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
    const num = (v: string | boolean) => (v ? Number(v) : null);

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        const payload = {
            ...form,
            expense_category_id: num(form.expense_category_id),
            customer_id: num(form.customer_id),
            project_id: num(form.project_id),
            currency_id: num(form.currency_id),
            tax_id: num(form.tax_id),
            tax2_id: num(form.tax2_id),
            payment_mode_id: num(form.payment_mode_id),
            repeat_every: num(form.repeat_every),
            recurring_type: form.repeat_every ? form.recurring_type : null,
            cycles: Number(form.cycles || 0),
        };
        try {
            const { data } = editing ? await api.put<{ data: Expense }>(`/expenses/${id}`, payload) : await api.post<{ data: Expense }>('/expenses', payload);
            await cf.save(data.data.id);
            toast('Expense saved.');
            navigate(`/expenses/${data.data.id}`);
        } catch (e) {
            setErrors(fieldErrors(e));
            setError(Object.keys(fieldErrors(e)).length ? null : errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const taxOptions = (
        <>
            <option value="">No Tax</option>
            {lists.taxes.map((t) => (
                <option key={t.id} value={t.id}>
                    {t.name} {Number(t.rate)}%
                </option>
            ))}
        </>
    );

    return (
        <div className="max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="page-title">{editing ? 'Edit Expense' : 'Record Expense'}</h4>
            </div>
            <ErrorNote message={error} />
            <div className="panel_s">
                <div className="panel-body grid gap-4 sm:grid-cols-2">
                    <Field label="Name" error={errors.name}>
                        <Input value={form.name as string} onChange={set('name')} />
                    </Field>
                    <Field label="Expense Category" required error={errors.expense_category_id} hint={lists.categories.length ? undefined : 'Add categories in Setup → Expense Categories.'}>
                        <Select value={form.expense_category_id as string} onChange={set('expense_category_id')}>
                            <option value="">Select</option>
                            {lists.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Expense Date" required error={errors.date}>
                        <Input type="date" value={form.date as string} onChange={set('date')} />
                    </Field>
                    <Field label="Amount" required error={errors.amount}>
                        <Input type="number" step="any" value={form.amount as string} onChange={set('amount')} />
                    </Field>
                    <Field label="Customer" error={errors.customer_id}>
                        <Select value={form.customer_id as string} onChange={(e) => setForm({ ...form, customer_id: e.target.value, project_id: '', billable: e.target.value ? form.billable : false })}>
                            <option value="">None</option>
                            {lists.customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Project" error={errors.project_id}>
                        <Select value={form.project_id as string} onChange={set('project_id')} disabled={!form.customer_id}>
                            <option value="">None</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <div className="sm:col-span-2">
                        <Checkbox label="Billable" checked={!!form.billable} disabled={!form.customer_id} onChange={(v) => setForm({ ...form, billable: v })} />
                    </div>
                    <Field label="Currency">
                        <Select value={form.currency_id as string} onChange={set('currency_id')}>
                            {lists.currencies.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.symbol})
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Payment Mode">
                        <Select value={form.payment_mode_id as string} onChange={set('payment_mode_id')}>
                            <option value="">—</option>
                            {lists.modes.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Tax 1">
                        <Select value={form.tax_id as string} onChange={set('tax_id')}>
                            {taxOptions}
                        </Select>
                    </Field>
                    <Field label="Tax 2">
                        <Select value={form.tax2_id as string} onChange={set('tax2_id')}>
                            {taxOptions}
                        </Select>
                    </Field>
                    <Field label="Reference #">
                        <Input value={form.reference_no as string} onChange={set('reference_no')} />
                    </Field>
                    <Field label="Repeat every" error={errors.repeat_every}>
                        <div className="flex gap-2">
                            <Input type="number" min={1} placeholder="No" value={form.repeat_every as string} onChange={set('repeat_every')} className="w-20" />
                            <Select value={form.recurring_type as string} onChange={set('recurring_type')} disabled={!form.repeat_every}>
                                {RECURRING_TYPES.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </Select>
                            <Input type="number" min={0} placeholder="Cycles (0 = ∞)" value={form.cycles as string} onChange={set('cycles')} disabled={!form.repeat_every} />
                        </div>
                    </Field>
                    <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                    <Field label="Note" className="sm:col-span-2">
                        <Textarea rows={4} value={form.note as string} onChange={set('note')} />
                    </Field>
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
