import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ListOrdered, NotebookPen, Package } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { money } from '../../lib/sales';
import { useStaff } from '../../hooks/useStaff';
import { Button, ErrorNote, Field, Input, SectionHeading, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Currency, Tax } from '../../types';
import { emptyLine, lineTotals, PurchaseLines, TITLES, type DocType, type Line } from './shared';

type Form = Record<string, string>;

/** Create / edit a purchase request, order or invoice. */
export default function PurchaseFormPage({ type }: { type: DocType }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const t = TITLES[type];
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [vendors, setVendors] = useState<{ id: number; name: string; currency_id: number | null }[]>([]);
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const [form, setForm] = useState<Form | null>(null);
    const [lines, setLines] = useState<Line[]>([emptyLine()]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const [tx, cur, ven, pr] = await Promise.all([
                api.get<{ data: Tax[] }>('/setup/taxes'),
                api.get<{ data: Currency[] }>('/setup/currencies'),
                type !== 'requests' ? api.get<{ data: { id: number; name: string; currency_id: number | null }[] }>('/purchase/vendors/options') : Promise.resolve({ data: { data: [] } }),
                api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { per_page: 200 } }).catch(() => ({ data: { data: [] } })),
            ]);
            setTaxes(tx.data.data);
            setCurrencies(cur.data.data);
            setVendors(ven.data.data);
            setProjects(pr.data.data);
            const base = String(cur.data.data.find((c) => c.is_default)?.id ?? '');

            if (id) {
                const { data } = await api.get<{ data: Record<string, unknown> & { items: (Line & { tax_rate: number; tax_name: string | null })[] } }>(`/purchase/${type}/${id}`);
                const d = data.data;
                const str = (k: string) => (d[k] === null || d[k] === undefined ? '' : String(d[k]));
                setForm({
                    name: str('name'), description: str('description'), department: str('department'), project_id: String((d.project as { id: number } | null)?.id ?? d.project_id ?? ''),
                    currency_id: str('currency_id') || String((d.currency as { id: number } | null)?.id ?? base), vendor_id: str('vendor_id'), buyer_id: str('buyer_id'),
                    order_date: str('order_date'), delivery_date: str('delivery_date'), invoice_date: str('invoice_date'), due_date: str('due_date'),
                    vendor_invoice_number: str('vendor_invoice_number'), transaction_id: str('transaction_id'), vendor_note: str('vendor_note'), admin_note: str('admin_note'),
                    terms: str('terms'), discount_type: str('discount_type'), discount_percent: str('discount_percent'), discount_total: str('discount_total'), shipping_fee: str('shipping_fee'),
                    requester_id: String((d.requester as { id: number } | null)?.id ?? ''),
                });
                setLines(
                    d.items.map((l) => ({
                        ...l,
                        qty: String(l.qty),
                        unit_price: String(l.unit_price),
                        tax_id: String(tx.data.data.find((x) => x.name === l.tax_name && Number(x.rate) === Number(l.tax_rate))?.id ?? ''),
                    })),
                );
            } else {
                setForm({
                    name: '', description: '', department: '', project_id: '', currency_id: base, vendor_id: '', buyer_id: '', order_date: todayIso(), delivery_date: '',
                    invoice_date: todayIso(), due_date: '', vendor_invoice_number: '', transaction_id: '', vendor_note: '', admin_note: '', terms: '',
                    discount_type: '', discount_percent: '', discount_total: '', shipping_fee: '', requester_id: '',
                });
            }
        })().catch((e) => setError(errorMessage(e)));
    }, [id, type]);

    if (!form) {
        return error ? <ErrorNote message={error} /> : <Spinner />;
    }
    const set = (key: string) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
    const currency = currencies.find((c) => String(c.id) === form.currency_id) ?? null;
    const totals = lineTotals(lines, taxes);
    const discount = form.discount_type === 'percent' ? (totals.subtotal * (Number(form.discount_percent) || 0)) / 100 : form.discount_type === 'fixed' ? Number(form.discount_total) || 0 : 0;
    const total = totals.subtotal + totals.tax - (type === 'requests' ? 0 : discount) + (type === 'requests' ? 0 : Number(form.shipping_fee) || 0);

    async function save() {
        setSaving(true);
        setErrors({});
        setError(null);
        const nul = (v: string) => (v === '' ? null : v);
        const payload: Record<string, unknown> = {
            currency_id: nul(form!.currency_id),
            items: lines.filter((l) => l.description.trim()).map((l) => ({ ...l, tax_id: l.tax_id ? Number(l.tax_id) : null, qty: Number(l.qty), unit_price: Number(l.unit_price) })),
        };
        if (type === 'requests') {
            Object.assign(payload, { name: form!.name, description: nul(form!.description), department: nul(form!.department), project_id: nul(form!.project_id), requester_id: nul(form!.requester_id) });
        } else {
            Object.assign(payload, {
                vendor_id: nul(form!.vendor_id), vendor_note: nul(form!.vendor_note), terms: nul(form!.terms), discount_type: nul(form!.discount_type),
                discount_percent: nul(form!.discount_percent), discount_total: nul(form!.discount_total), shipping_fee: nul(form!.shipping_fee),
            });
        }
        if (type === 'orders') {
            Object.assign(payload, { name: form!.name, order_date: form!.order_date, delivery_date: nul(form!.delivery_date), project_id: nul(form!.project_id), buyer_id: nul(form!.buyer_id) });
        }
        if (type === 'invoices') {
            Object.assign(payload, { invoice_date: form!.invoice_date, due_date: nul(form!.due_date), vendor_invoice_number: nul(form!.vendor_invoice_number), transaction_id: nul(form!.transaction_id), admin_note: nul(form!.admin_note) });
        }
        try {
            const { data } = id ? await api.put<{ data: { id: number } }>(`/purchase/${type}/${id}`, payload) : await api.post<{ data: { id: number } }>(`/purchase/${type}`, payload);
            toast(`${t.one} saved.`);
            navigate(`${t.path}/${data.data.id}`);
        } catch (e) {
            const errs = (e as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors ?? {};
            setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]])));
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center gap-2">
                <Link to={id ? `${t.path}/${id}` : t.path} className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title">{id ? `Edit ${t.one}` : `New ${t.one}`}</h4>
            </div>
            <ErrorNote message={error} />
            <div className="panel_s">
                <div className="panel-body grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SectionHeading icon={Package} title="Details" hint="Vendor, dates and who it is for." className="sm:col-span-2 lg:col-span-3" />
                    {type !== 'invoices' && (
                        <Field label={type === 'requests' ? 'Purchase Request Name' : 'Order Name'} required error={errors.name}>
                            <Input value={form.name} onChange={set('name')} />
                        </Field>
                    )}
                    {type !== 'requests' && (
                        <Field label="Vendor" required error={errors.vendor_id}>
                            <Select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value, currency_id: String(vendors.find((v) => String(v.id) === e.target.value)?.currency_id ?? form.currency_id) })}>
                                <option value="">Select vendor</option>
                                {vendors.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}
                    {type === 'invoices' && (
                        <>
                            <Field label="Vendor Invoice #" error={errors.vendor_invoice_number}>
                                <Input value={form.vendor_invoice_number} onChange={set('vendor_invoice_number')} />
                            </Field>
                            <Field label="Invoice Date" required error={errors.invoice_date}>
                                <Input type="date" value={form.invoice_date} onChange={set('invoice_date')} />
                            </Field>
                            <Field label="Due Date" error={errors.due_date}>
                                <Input type="date" value={form.due_date} onChange={set('due_date')} />
                            </Field>
                            <Field label="Transaction ID">
                                <Input value={form.transaction_id} onChange={set('transaction_id')} />
                            </Field>
                        </>
                    )}
                    {type === 'orders' && (
                        <>
                            <Field label="Order Date" required error={errors.order_date}>
                                <Input type="date" value={form.order_date} onChange={set('order_date')} />
                            </Field>
                            <Field label="Delivery Date" error={errors.delivery_date}>
                                <Input type="date" value={form.delivery_date} onChange={set('delivery_date')} />
                            </Field>
                            <Field label="Buyer">
                                <Select value={form.buyer_id} onChange={set('buyer_id')}>
                                    <option value="">—</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </>
                    )}
                    {type === 'requests' && (
                        <>
                            <Field label="Requester">
                                <Select value={form.requester_id} onChange={set('requester_id')}>
                                    <option value="">Me</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Department">
                                <Input value={form.department} onChange={set('department')} />
                            </Field>
                        </>
                    )}
                    {type !== 'invoices' && (
                        <Field label="Project">
                            <Select value={form.project_id} onChange={set('project_id')}>
                                <option value="">—</option>
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}
                    <Field label="Currency">
                        <Select value={form.currency_id} onChange={set('currency_id')}>
                            {currencies.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.symbol})
                                </option>
                            ))}
                        </Select>
                    </Field>
                    {type === 'requests' && (
                        <Field label="Description" className="sm:col-span-2 lg:col-span-3">
                            <Textarea rows={3} value={form.description} onChange={set('description')} />
                        </Field>
                    )}
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body space-y-4">
                    <SectionHeading icon={ListOrdered} title="Items" hint="What you are buying, with quantities, rates and taxes." className="" />
                    <PurchaseLines lines={lines} onLines={setLines} taxes={taxes} currency={currency} />
                    {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}
                    <div className="ml-auto max-w-sm space-y-1.5 text-[13.5px]">
                        <Row label="Sub Total" value={money(totals.subtotal, currency)} />
                        {type !== 'requests' && (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-600">Discount</span>
                                <div className="flex items-center gap-1">
                                    <Select value={form.discount_type} onChange={set('discount_type')} className="w-24">
                                        <option value="">None</option>
                                        <option value="percent">%</option>
                                        <option value="fixed">Fixed</option>
                                    </Select>
                                    {form.discount_type === 'percent' && <Input type="number" value={form.discount_percent} onChange={set('discount_percent')} className="w-20 text-right" />}
                                    {form.discount_type === 'fixed' && <Input type="number" value={form.discount_total} onChange={set('discount_total')} className="w-24 text-right" />}
                                </div>
                            </div>
                        )}
                        <Row label="Tax" value={money(totals.tax, currency)} />
                        {type !== 'requests' && (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-600">Shipping fee</span>
                                <Input type="number" value={form.shipping_fee} onChange={set('shipping_fee')} className="w-28 text-right" />
                            </div>
                        )}
                        <Row label="Total" value={money(total, currency)} strong />
                    </div>
                </div>
            </div>

            {type !== 'requests' && (
                <div className="panel_s">
                    <div className="panel-body grid gap-4 sm:grid-cols-2">
                        <SectionHeading icon={NotebookPen} title="Notes & terms" className="sm:col-span-2" />
                        <Field label="Vendor Note">
                            <Textarea rows={3} value={form.vendor_note} onChange={set('vendor_note')} />
                        </Field>
                        <Field label="Terms & Conditions">
                            <Textarea rows={3} value={form.terms} onChange={set('terms')} />
                        </Field>
                        {type === 'invoices' && (
                            <Field label="Admin Note" className="sm:col-span-2">
                                <Textarea rows={2} value={form.admin_note} onChange={set('admin_note')} />
                            </Field>
                        )}
                    </div>
                </div>
            )}
            <div className="flex justify-end">
                <Button onClick={save} loading={saving}>
                    Save
                </Button>
            </div>
        </div>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={`flex justify-between ${strong ? 'border-t border-gray-200 pt-1.5 font-semibold' : ''}`}>
            <span className={strong ? '' : 'text-gray-600'}>{label}</span>
            <span>{value}</span>
        </div>
    );
}
