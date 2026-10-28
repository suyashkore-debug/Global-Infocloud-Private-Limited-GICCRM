import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, Checkbox, EmptyState, ErrorNote, Field, Input, Modal, Pagination, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Currency } from '../../types';

type VendorRow = { id: number; vendor_code: string | null; name: string; phone: string | null; vat: string | null; active: boolean; primary_contact: { name: string; email: string | null } | null; categories: string[]; invoiced: number; created_at: string };
type VendorContact = { id: number; first_name: string; last_name: string | null; email: string | null; phone: string | null; title: string | null; is_primary: boolean; active: boolean };
type Vendor = Record<string, unknown> & { id: number; name: string; category_ids: number[] | null; contacts: VendorContact[]; totals: { invoiced: number; paid: number; orders: number; invoices: number }; active: boolean };

/** Perfex purchase → Vendors. */
export default function VendorsPage() {
    const navigate = useNavigate();
    const canCreate = usePermission('purchase_vendors.create');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState('');
    const [open, setOpen] = useState(false);
    const { data: categories } = useApi<{ data: { id: number; name: string }[] }>('/setup/vendor-categories');
    const { data, loading, error, reload } = useApi<{ data: VendorRow[]; meta: { current_page: number; last_page: number; total: number } }>('/purchase/vendors', { search: search || undefined, page, category_id: category || undefined });

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Vendors</h4>
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4" /> New Vendor
                    </Button>
                )}
                <Select value={category} onChange={(e) => (setCategory(e.target.value), setPage(1))} className="w-48">
                    <option value="">All categories</option>
                    {(categories?.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </Select>
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search vendors..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data ? null : data.data.length === 0 ? (
                <EmptyState title="No vendors yet" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Company</th>
                                    <th>Primary Contact</th>
                                    <th>Phone</th>
                                    <th>Category</th>
                                    <th className="text-right">Invoiced</th>
                                    <th>Active</th>
                                    <th>Date Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((v) => (
                                    <tr key={v.id} className="cursor-pointer" onClick={() => navigate(`/purchase/vendors/${v.id}`)}>
                                        <td>{v.vendor_code}</td>
                                        <td className="font-medium text-blue-600">{v.name}</td>
                                        <td>
                                            {v.primary_contact?.name}
                                            {v.primary_contact?.email && <span className="block text-xs text-gray-500">{v.primary_contact.email}</span>}
                                        </td>
                                        <td>{v.phone}</td>
                                        <td>{v.categories.join(', ')}</td>
                                        <td className="text-right">{money(v.invoiced)}</td>
                                        <td>{v.active ? 'Yes' : 'No'}</td>
                                        <td>{formatDate(v.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}
            {open && (
                <VendorFormModal
                    vendor={null}
                    onClose={() => setOpen(false)}
                    onSaved={(v) => {
                        setOpen(false);
                        reload();
                        navigate(`/purchase/vendors/${v.id}`);
                    }}
                />
            )}
        </div>
    );
}

const FIELDS: [string, string][] = [
    ['vendor_code', 'Vendor Code'],
    ['vat', 'GSTIN / VAT'],
    ['phone', 'Phone'],
    ['email', 'Email'],
    ['website', 'Website'],
    ['city', 'City'],
    ['state', 'State'],
    ['zip', 'Zip Code'],
    ['country', 'Country'],
];

function VendorFormModal({ vendor, onClose, onSaved }: { vendor: Vendor | null; onClose: () => void; onSaved: (v: Vendor) => void }) {
    const { data: categories } = useApi<{ data: { id: number; name: string }[] }>('/setup/vendor-categories');
    const { data: currencies } = useApi<{ data: Currency[] }>('/setup/currencies');
    const [form, setForm] = useState<Record<string, string>>(() =>
        Object.fromEntries(['name', 'address', 'bank_detail', 'payment_terms', 'currency_id', ...FIELDS.map(([k]) => k)].map((k) => [k, vendor?.[k] == null ? '' : String(vendor[k])])),
    );
    const [cats, setCats] = useState<number[]>(vendor?.category_ids ?? []);
    const [active, setActive] = useState(vendor?.active ?? true);
    const [contact, setContact] = useState({ first_name: '', last_name: '', email: '', phone: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        setErrors({});
        const body = {
            ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])),
            category_ids: cats,
            active,
            contact: vendor ? undefined : contact.first_name ? contact : undefined,
        };
        try {
            const res = vendor ? await api.put<{ data: Vendor }>(`/purchase/vendors/${vendor.id}`, body) : await api.post<{ data: Vendor }>('/purchase/vendors', body);
            onSaved(res.data.data);
        } catch (e) {
            const errs = (e as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors ?? {};
            setErrors(Object.keys(errs).length ? Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]])) : { _: errorMessage(e) });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            size="lg"
            title={vendor ? `Edit ${vendor.name}` : 'New Vendor'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!form.name.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <ErrorNote message={errors._ ?? null} />
                <Field label="Company" required error={errors.name}>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                    {FIELDS.map(([k, label]) => (
                        <Field key={k} label={label} error={errors[k]}>
                            <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                        </Field>
                    ))}
                    <Field label="Currency">
                        <Select value={form.currency_id} onChange={(e) => setForm({ ...form, currency_id: e.target.value })}>
                            <option value="">Default</option>
                            {(currencies?.data ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>
                <Field label="Address">
                    <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Bank details">
                        <Textarea rows={2} value={form.bank_detail} onChange={(e) => setForm({ ...form, bank_detail: e.target.value })} />
                    </Field>
                    <Field label="Payment terms">
                        <Textarea rows={2} value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} />
                    </Field>
                </div>
                <div>
                    <p className="mb-1 text-[13px] font-medium text-gray-700">Categories</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {(categories?.data ?? []).map((c) => (
                            <Checkbox key={c.id} label={c.name} checked={cats.includes(c.id)} onChange={(v) => setCats(v ? [...cats, c.id] : cats.filter((x) => x !== c.id))} />
                        ))}
                        {categories?.data.length === 0 && <span className="text-xs text-gray-500">Add categories in Setup → Vendor Categories.</span>}
                    </div>
                </div>
                <Checkbox label="Active" checked={active} onChange={setActive} />
                {!vendor && (
                    <div className="rounded-md border border-gray-200 p-3">
                        <p className="mb-2 text-[13px] font-medium">Primary Contact</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input placeholder="First name" value={contact.first_name} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} />
                            <Input placeholder="Last name" value={contact.last_name} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} />
                            <Input placeholder="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                            <Input placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

/** One vendor: details, contacts and totals, with links to its orders and invoices. */
export function VendorViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const canEdit = usePermission('purchase_vendors.edit');
    const canDelete = usePermission('purchase_vendors.delete');
    const { data, setData, error } = useApi<{ data: Vendor }>(`/purchase/vendors/${id}`);
    const [editing, setEditing] = useState(false);
    const [contact, setContact] = useState<VendorContact | 'new' | null>(null);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!data) {
        return <Spinner />;
    }
    const v = data.data;

    async function remove() {
        if (!confirm(`Delete ${v.name}?`)) {
            return;
        }
        try {
            await api.delete(`/purchase/vendors/${v.id}`);
            navigate('/purchase/vendors');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link to="/purchase/vendors" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">
                    {v.name} {!v.active && <span className="text-sm font-normal text-gray-500">(inactive)</span>}
                </h4>
                {canEdit && (
                    <Button variant="secondary" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4" /> Edit
                    </Button>
                )}
                {canDelete && (
                    <Button variant="danger" onClick={remove} title="Delete">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
                {[
                    ['Invoiced', money(v.totals.invoiced)],
                    ['Paid', money(v.totals.paid)],
                    ['Due', money(v.totals.invoiced - v.totals.paid)],
                    ['Orders / Invoices', `${v.totals.orders} / ${v.totals.invoices}`],
                ].map(([l, val]) => (
                    <div key={l} className="panel_s">
                        <div className="panel-body">
                            <p className="text-[13px] text-gray-500">{l}</p>
                            <p className="mt-1 text-xl font-semibold">{val}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="panel_s">
                    <div className="panel-body grid gap-2 text-[13.5px] sm:grid-cols-2">
                        {[...FIELDS, ['address', 'Address'], ['bank_detail', 'Bank details'], ['payment_terms', 'Payment terms']].map(([k, label]) =>
                            v[k] ? (
                                <div key={k}>
                                    <p className="text-xs text-gray-500">{label}</p>
                                    <p className="whitespace-pre-wrap font-medium">{String(v[k])}</p>
                                </div>
                            ) : null,
                        )}
                    </div>
                </div>
                <div className="panel_s">
                    <div className="panel-body space-y-2">
                        <div className="flex items-center justify-between">
                            <h5 className="font-semibold">Contacts</h5>
                            {canEdit && (
                                <Button size="sm" variant="secondary" onClick={() => setContact('new')}>
                                    <Plus className="h-4 w-4" /> New Contact
                                </Button>
                            )}
                        </div>
                        <ul className="divide-y divide-gray-100 text-[13.5px]">
                            {v.contacts.map((c) => (
                                <li key={c.id} className="flex items-center gap-2 py-2">
                                    <span className="flex-1">
                                        <span className="font-medium">
                                            {c.first_name} {c.last_name}
                                        </span>
                                        {c.is_primary && <span className="ml-2 rounded bg-blue-50 px-1.5 text-[10px] font-semibold uppercase text-blue-700">Primary</span>}
                                        <span className="block text-xs text-gray-500">{[c.title, c.email, c.phone].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    {canEdit && (
                                        <>
                                            <button type="button" onClick={() => setContact(c)} className="text-gray-400 hover:text-gray-700" title="Edit">
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => confirm('Delete this contact?') && api.delete<{ data: Vendor }>(`/purchase/vendors/${v.id}/contacts/${c.id}`).then((r) => setData(r.data))}
                                                className="text-gray-400 hover:text-red-600"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                            {v.contacts.length === 0 && <li className="py-2 text-gray-500">No contacts.</li>}
                        </ul>
                    </div>
                </div>
            </div>
            <div className="flex gap-3 text-[13px]">
                <Link to={`/purchase/orders?vendor_id=${v.id}`} className="text-blue-600 hover:underline">
                    Purchase orders →
                </Link>
                <Link to={`/purchase/invoices?vendor_id=${v.id}`} className="text-blue-600 hover:underline">
                    Purchase invoices →
                </Link>
            </div>
            {editing && (
                <VendorFormModal
                    vendor={v}
                    onClose={() => setEditing(false)}
                    onSaved={(nv) => {
                        setEditing(false);
                        setData({ data: nv });
                    }}
                />
            )}
            {contact && <ContactModal vendorId={v.id} contact={contact === 'new' ? null : contact} onClose={() => setContact(null)} onSaved={(nv) => (setContact(null), setData({ data: nv }))} />}
        </div>
    );
}

function ContactModal({ vendorId, contact, onClose, onSaved }: { vendorId: number; contact: VendorContact | null; onClose: () => void; onSaved: (v: Vendor) => void }) {
    const [form, setForm] = useState({ first_name: contact?.first_name ?? '', last_name: contact?.last_name ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '', title: contact?.title ?? '' });
    const [primary, setPrimary] = useState(contact?.is_primary ?? false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => setError(null), [form]);

    async function save() {
        try {
            const body = { ...form, is_primary: primary };
            const res = contact ? await api.put<{ data: Vendor }>(`/purchase/vendors/${vendorId}/contacts/${contact.id}`, body) : await api.post<{ data: Vendor }>(`/purchase/vendors/${vendorId}/contacts`, body);
            onSaved(res.data.data);
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    return (
        <Modal
            open
            title={contact ? 'Edit Contact' : 'New Contact'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={!form.first_name.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <ErrorNote message={error} />
                {(['first_name', 'last_name', 'email', 'phone', 'title'] as const).map((k) => (
                    <Field key={k} label={{ first_name: 'First Name', last_name: 'Last Name', email: 'Email', phone: 'Phone', title: 'Position' }[k]}>
                        <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </Field>
                ))}
                <div className="pt-6">
                    <Checkbox label="Primary contact" checked={primary} onChange={setPrimary} />
                </div>
            </div>
        </Modal>
    );
}
