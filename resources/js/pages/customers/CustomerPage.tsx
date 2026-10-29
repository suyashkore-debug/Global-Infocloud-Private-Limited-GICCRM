import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Check, Globe, Mail, MapPin, Pencil, Phone, Plus, Receipt, Star, Trash2, Truck, UserRound, Users } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, FormSection, IconButton, Input, Modal, Select, Spinner, StaffMultiSelect, Tabs, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthContext';
import { NotesPanel, RemindersPanel } from '../../components/records/RecordPanels';
import { ContractsTable } from '../crm/ContractsPage';
import { ExpensesTable } from '../crm/ExpensesPage';
import { TicketsTable } from '../crm/TicketsPage';
import { CreditNotesTable } from '../sales/CreditNotesPage';
import { EstimatesTable } from '../sales/EstimatesPage';
import { InvoicesTable } from '../sales/InvoicesPage';
import { ProposalsTable } from '../sales/ProposalsPage';
import { PaymentsTable } from '../sales/PaymentsPage';
import type { Contact, Currency, CustomerFull, Project } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';
import { useAppOptions } from '../../hooks/useAppOptions';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'proposals', label: 'Proposals' },
    { id: 'estimates', label: 'Estimates' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'payments', label: 'Payments' },
    { id: 'credit-notes', label: 'Credit Notes' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'contracts', label: 'Contracts' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'notes', label: 'Notes' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'projects', label: 'Projects' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Perfex customer page: new customer form, or an existing customer's profile and tabs. */
export default function CustomerPage() {
    const { id } = useParams();
    const isNew = id === 'new';
    const [params, setParams] = useSearchParams();
    const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'profile') as TabId;
    const { data, error, reload } = useApi<{ data: CustomerFull }>(isNew ? null : `/customers/${id}`);
    const customer = data?.data;
    usePageCrumb(customer?.name);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!isNew && !customer) {
        return <Spinner />;
    }

    return (
        <div className="w-full space-y-4">
            {isNew || !customer ? (
                <div className="flex items-center justify-between">
                    <h4 className="page-title">New Customer</h4>
                    <Link to="/customers" className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-brand">
                        <ArrowLeft className="h-4 w-4" /> Customers
                    </Link>
                </div>
            ) : (
                <div className="panel_s !mb-0 overflow-hidden">
                    <div className="flex flex-wrap items-start gap-4 px-5 py-5 sm:px-6">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2c56] to-[#1a4f8f] text-[20px] font-bold text-white shadow-md shadow-brand/20">
                            {customer.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                            <h1 className=" flex flex-wrap items-center gap-2 text-[22px] font-bold leading-tight tracking-tight text-slate-800">
                                <span className="text-slate-400">#{customer.id}</span> {customer.name}
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${customer.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${customer.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                    {customer.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </h1>
                            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-slate-500">
                                {customer.primary_contact && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <UserRound className="h-4 w-4 text-slate-400" /> {customer.primary_contact.name}
                                    </span>
                                )}
                                {(customer.primary_contact?.email ?? customer.email) && (
                                    <a href={`mailto:${customer.primary_contact?.email ?? customer.email}`} className="inline-flex items-center gap-1.5 hover:text-brand">
                                        <Mail className="h-4 w-4 text-slate-400" /> {customer.primary_contact?.email ?? customer.email}
                                    </a>
                                )}
                                {customer.phone && (
                                    <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand">
                                        <Phone className="h-4 w-4 text-slate-400" /> {customer.phone}
                                    </a>
                                )}
                                {(customer.city || customer.state) && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin className="h-4 w-4 text-slate-400" /> {[customer.city, customer.state].filter(Boolean).join(', ')}
                                    </span>
                                )}
                                {customer.website && (
                                    <a href={/^https?:/.test(customer.website) ? customer.website : `https://${customer.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-brand">
                                        <Globe className="h-4 w-4 text-slate-400" /> {customer.website.replace(/^https?:\/\//, '')}
                                    </a>
                                )}
                            </div>
                            {(customer.groups?.length ?? 0) > 0 && (
                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {customer.groups!.map((g) => (
                                        <span key={g.id} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-brand">
                                            {g.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {!isNew && <Tabs tabs={[...TABS]} active={tab} onChange={(t) => setParams({ tab: t })} />}

            {(isNew || tab === 'profile') && <ProfileForm customer={customer ?? null} onSaved={reload} />}
            {!isNew && tab === 'contacts' && <ContactsTab customer={customer!} reload={reload} />}
            {!isNew && tab === 'proposals' && <ProposalsTable customerId={customer!.id} />}
            {!isNew && tab === 'estimates' && <EstimatesTable customerId={customer!.id} />}
            {!isNew && tab === 'invoices' && <InvoicesTable customerId={customer!.id} />}
            {!isNew && tab === 'credit-notes' && <CreditNotesTable customerId={customer!.id} />}
            {!isNew && tab === 'expenses' && <ExpensesTable customerId={customer!.id} />}
            {!isNew && tab === 'contracts' && <ContractsTable customerId={customer!.id} />}
            {!isNew && tab === 'tickets' && <TicketsTable customerId={customer!.id} />}
            {!isNew && tab === 'notes' && (
                <div className="panel_s">
                    <div className="panel-body">
                        <NotesPanel type="customer" id={customer!.id} />
                    </div>
                </div>
            )}
            {!isNew && tab === 'reminders' && (
                <div className="panel_s">
                    <div className="panel-body">
                        <RemindersPanel type="customer" id={customer!.id} />
                    </div>
                </div>
            )}
            {!isNew && tab === 'payments' && <PaymentsTable customerId={customer!.id} />}
            {!isNew && tab === 'projects' && <CustomerProjects customerId={customer!.id} />}
        </div>
    );
}

interface ProfileState {
    name: string;
    vat: string;
    company_pan: string;
    gst_type: string;
    phone: string;
    website: string;
    email: string;
    default_currency_id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    is_active: boolean;
    groups: number[];
    admins: number[];
    billing: Record<string, string>;
    shipping: Record<string, string>;
    contact: { first_name: string; last_name: string; email: string; phone: string; title: string };
}

const ADDRESS_FIELDS = ['street', 'city', 'state', 'zip', 'country'] as const;

function ProfileForm({ customer, onSaved }: { customer: CustomerFull | null; onSaved: () => void }) {
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const canSave = usePermission(customer ? 'customers.edit' : 'customers.create');
    const canDelete = usePermission('customers.delete');
    const [section, setSection] = useState<'details' | 'billing'>('details');
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('customers', customer?.id);
    const appOptions = useAppOptions();
    const [form, setForm] = useState<ProfileState>(() => ({
        name: customer?.name ?? '',
        vat: customer?.vat ?? '',
        company_pan: customer?.company_pan ?? '',
        gst_type: customer?.gst_type ?? '',
        phone: customer?.phone ?? '',
        website: customer?.website ?? '',
        email: customer?.email ?? '',
        default_currency_id: String(customer?.default_currency_id ?? ''),
        address: customer?.address ?? '',
        city: customer?.city ?? '',
        state: customer?.state ?? '',
        zip: customer?.zip ?? '',
        country: customer?.country ?? '',
        is_active: customer?.is_active ?? true,
        groups: customer?.groups?.map((g) => g.id) ?? [],
        admins: customer?.admins?.map((a) => a.id) ?? [],
        billing: Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, customer?.billing?.[f] ?? ''])),
        shipping: Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, customer?.shipping?.[f] ?? ''])),
        contact: { first_name: '', last_name: '', email: '', phone: '', title: '' },
    }));
    // Settings → Customers: default country of a new customer.
    useEffect(() => {
        if (!customer && appOptions?.customer_default_country) {
            setForm((f) => (f.country ? f : { ...f, country: appOptions.customer_default_country }));
        }
    }, [customer, appOptions]);

    useEffect(() => {
        api.get<{ data: Currency[] }>('/setup/currencies').then((r) => setCurrencies(r.data.data));
        api.get<{ data: { id: number; name: string }[] }>('/setup/customer-groups').then((r) => setGroups(r.data.data));
    }, []);

    const set = <K extends keyof ProfileState>(key: K, value: ProfileState[K]) => setForm((f) => ({ ...f, [key]: value }));
    const text = (key: keyof ProfileState) => (e: { target: { value: string } }) => set(key, e.target.value as never);

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        const payload = {
            ...form,
            default_currency_id: form.default_currency_id ? Number(form.default_currency_id) : null,
            ...Object.fromEntries(ADDRESS_FIELDS.map((f) => [`billing_${f}`, form.billing[f] || null])),
            ...Object.fromEntries(ADDRESS_FIELDS.map((f) => [`shipping_${f}`, form.shipping[f] || null])),
            contact: !customer && form.contact.email ? form.contact : null,
        };
        try {
            const { data } = customer ? await api.put<{ data: CustomerFull }>(`/customers/${customer.id}`, payload) : await api.post<{ data: CustomerFull }>('/customers', payload);
            await cf.save(data.data.id);
            toast(customer ? 'Customer updated.' : 'Customer created.');
            if (customer) {
                onSaved();
            } else {
                navigate(`/customers/${data.data.id}`);
            }
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!customer || !confirm(`Delete customer "${customer.name}"?`)) {
            return;
        }
        try {
            await api.delete(`/customers/${customer.id}`);
            toast('Customer deleted.');
            navigate('/customers');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    function copyBillingFromCustomer() {
        set('billing', { street: form.address, city: form.city, state: form.state, zip: form.zip, country: form.country });
    }

    return (
        <div className="panel_s">
            <div className="border-b border-gray-200 px-6 pt-2">
                <Tabs
                    tabs={[
                        { id: 'details', label: 'Customer Details' },
                        { id: 'billing', label: 'Billing & Shipping' },
                    ]}
                    active={section}
                    onChange={setSection}
                />
            </div>
            <div className="panel-body">
                {section === 'details' ? (
                    <div className="space-y-4">
                        <FormSection icon={Building2} title="Company" hint="Who the customer is and how you bill them.">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Company" required error={errors.name}>
                                    <Input value={form.name} onChange={text('name')} autoFocus placeholder="Company name" />
                                </Field>
                                <Field label="Phone" error={errors.phone}>
                                    <Input value={form.phone} onChange={text('phone')} placeholder="98765 43210" />
                                </Field>
                                <Field label="GST Number" error={errors.vat}>
                                    <Input value={form.vat} onChange={text('vat')} placeholder="27ABCDE1234F1Z5" />
                                </Field>
                                <Field label="PAN" error={errors.company_pan}>
                                    <Input value={form.company_pan} onChange={text('company_pan')} placeholder="ABCDE1234F" />
                                </Field>
                                <Field label="GST Type" error={errors.gst_type}>
                                    <Select value={form.gst_type} onChange={text('gst_type')}>
                                        <option value="">—</option>
                                        <option value="regular">Regular</option>
                                        <option value="composition">Composition</option>
                                        <option value="unregistered">Unregistered</option>
                                        <option value="overseas">Overseas</option>
                                    </Select>
                                </Field>
                                <Field label="Website" error={errors.website}>
                                    <Input value={form.website} onChange={text('website')} placeholder="www.example.com" />
                                </Field>
                                <Field label="Currency" hint="Used by default on this customer's invoices.">
                                    <Select value={form.default_currency_id} onChange={text('default_currency_id')}>
                                        <option value="">System default</option>
                                        {currencies.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} ({c.symbol})
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <div>
                                    <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">Groups</span>
                                    <div className="flex min-h-[42px] flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                                        {groups.length === 0 && <span className="px-1 text-[13px] text-slate-400">No customer groups yet (Setup → Customers → Groups).</span>}
                                        {groups.map((g) => {
                                            const on = form.groups.includes(g.id);

                                            return (
                                                <button
                                                    key={g.id}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={(e) => (e.preventDefault(), set('groups', on ? form.groups.filter((x) => x !== g.id) : [...form.groups, g.id]))}
                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold transition ${on ? 'bg-brand text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                >
                                                    {on && <Check className="h-3.5 w-3.5" />}
                                                    {g.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </FormSection>

                        <FormSection icon={MapPin} title="Address">
                            <div className="grid gap-4 sm:grid-cols-4">
                                <Field label="Address" className="sm:col-span-4">
                                    <Textarea rows={2} value={form.address} onChange={text('address')} placeholder="Building, street, area" />
                                </Field>
                                <Field label="City">
                                    <Input value={form.city} onChange={text('city')} />
                                </Field>
                                <Field label="State">
                                    <Input value={form.state} onChange={text('state')} />
                                </Field>
                                <Field label="Zip Code">
                                    <Input value={form.zip} onChange={text('zip')} />
                                </Field>
                                <Field label="Country">
                                    <Input value={form.country} onChange={text('country')} />
                                </Field>
                            </div>
                        </FormSection>

                        <FormSection icon={Users} title="Team & status" hint="Staff who look after this customer.">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Customer Admins" className="sm:col-span-2">
                                    <StaffMultiSelect staff={staff} value={form.admins} onChange={(ids) => set('admins', ids)} />
                                </Field>
                                <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                                <div className="sm:col-span-2">
                                    <Checkbox label="Active: inactive customers are hidden from pickers" checked={form.is_active} onChange={(v) => set('is_active', v)} />
                                </div>
                            </div>
                        </FormSection>

                        {!customer && (
                            <FormSection icon={UserRound} title="Primary contact" hint="The person you deal with. They can sign in to the customer area.">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="First Name" error={errors['contact.first_name']}>
                                        <Input value={form.contact.first_name} onChange={(e) => set('contact', { ...form.contact, first_name: e.target.value })} />
                                    </Field>
                                    <Field label="Last Name">
                                        <Input value={form.contact.last_name} onChange={(e) => set('contact', { ...form.contact, last_name: e.target.value })} />
                                    </Field>
                                    <Field label="Email" error={errors['contact.email']}>
                                        <Input type="email" value={form.contact.email} onChange={(e) => set('contact', { ...form.contact, email: e.target.value })} placeholder="name@company.com" />
                                    </Field>
                                    <Field label="Phone">
                                        <Input value={form.contact.phone} onChange={(e) => set('contact', { ...form.contact, phone: e.target.value })} />
                                    </Field>
                                </div>
                            </FormSection>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2">
                        {(['billing', 'shipping'] as const).map((kind) => (
                            <FormSection key={kind} icon={kind === 'billing' ? Receipt : Truck} title={kind === 'billing' ? 'Billing address' : 'Shipping address'}>
                                <div className="space-y-3">
                                <div className="flex justify-end">
                                    {kind === 'billing' ? (
                                        <button type="button" onClick={copyBillingFromCustomer} className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-100">
                                            Same as Customer Info
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => set('shipping', { ...form.billing })} className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-100">
                                            Copy Billing Address
                                        </button>
                                    )}
                                </div>
                                {ADDRESS_FIELDS.map((f) => (
                                    <Field key={f} label={f[0].toUpperCase() + f.slice(1)}>
                                        {f === 'street' ? (
                                            <Textarea rows={2} value={form[kind][f]} onChange={(e) => set(kind, { ...form[kind], [f]: e.target.value })} />
                                        ) : (
                                            <Input value={form[kind][f]} onChange={(e) => set(kind, { ...form[kind], [f]: e.target.value })} />
                                        )}
                                    </Field>
                                ))}
                                </div>
                            </FormSection>
                        ))}
                    </div>
                )}
            </div>
            {canSave && (
                <div className="flex justify-between gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
                    <div>
                        {customer && canDelete && (
                            <Button variant="ghost" onClick={remove} className="!text-red-600">
                                <Trash2 className="h-4 w-4" /> Delete
                            </Button>
                        )}
                    </div>
                    <Button onClick={save} loading={saving}>
                        <Check className="h-4 w-4" />
                        {customer ? 'Save changes' : 'Add customer'}
                    </Button>
                </div>
            )}
        </div>
    );
}

const EMAIL_PREFS = [
    ['invoice_emails', 'Invoice'],
    ['estimate_emails', 'Estimate'],
    ['credit_note_emails', 'Credit Note'],
    ['project_emails', 'Project'],
    ['task_emails', 'Task'],
    ['contract_emails', 'Contract'],
    ['ticket_emails', 'Ticket'],
] as const;

function ContactsTab({ customer, reload }: { customer: CustomerFull; reload: () => void }) {
    const toast = useToast();
    const canEdit = usePermission('customers.edit');
    const [editing, setEditing] = useState<Contact | null>(null);
    const [open, setOpen] = useState(false);

    async function remove(contact: Contact) {
        if (!confirm(`Delete contact ${contact.first_name}?`)) {
            return;
        }
        try {
            await api.delete(`/contacts/${contact.id}`);
            toast('Contact deleted.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="space-y-4">
            {canEdit && (
                <Button onClick={() => (setEditing(null), setOpen(true))}>
                    <Plus className="h-4 w-4" /> New Contact
                </Button>
            )}
            <div className="panel_s overflow-hidden">
                <table className="table-perfex">
                    <thead>
                        <tr>
                            <th>Full Name</th>
                            <th>Email</th>
                            <th>Position</th>
                            <th>Phone</th>
                            <th>Active</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(customer.contacts ?? []).map((c) => (
                            <tr key={c.id}>
                                <td>
                                    {c.first_name} {c.last_name}
                                    {c.is_primary && <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                                </td>
                                <td>
                                    <a href={`mailto:${c.email}`}>{c.email}</a>
                                </td>
                                <td>{c.title}</td>
                                <td>{c.phone}</td>
                                <td>{c.active ? 'Yes' : 'No'}</td>
                                <td>
                                    {canEdit && (
                                        <div className="flex justify-end gap-1">
                                            <IconButton label="Edit" onClick={() => (setEditing(c), setOpen(true))}>
                                                <Pencil className="h-4 w-4" />
                                            </IconButton>
                                            <IconButton label="Delete" onClick={() => remove(c)} className="hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </IconButton>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {(customer.contacts ?? []).length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center text-gray-500">
                                    No contacts yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <ContactModal open={open} customerId={customer.id} contact={editing} onClose={() => setOpen(false)} onSaved={() => (setOpen(false), reload())} />
        </div>
    );
}

const PORTAL_PERMISSIONS: [string, string][] = [
    ['invoices', 'Invoices'],
    ['estimates', 'Estimates'],
    ['contracts', 'Contracts'],
    ['proposals', 'Proposals'],
    ['support', 'Support'],
    ['projects', 'Projects'],
];

function ContactModal({ open, customerId, contact, onClose, onSaved }: { open: boolean; customerId: number; contact: Contact | null; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const { user } = useAuth();
    // This company's customers-area login page (shows the company's logo).
    const portalLoginUrl = `${window.location.origin}/portal/login${user?.company?.portal_slug ? `?company=${user.company.portal_slug}` : ''}`;
    const blank = {
        first_name: '', last_name: '', email: '', phone: '', title: '', is_primary: false, active: true, invoice_emails: true, estimate_emails: true, credit_note_emails: true,
        project_emails: true, task_emails: true, contract_emails: true, ticket_emails: true, password: '', permissions: [...PORTAL_PERMISSIONS.map(([k]) => k)] as string[],
    };
    const appOptions = useAppOptions();
    const [form, setForm] = useState(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const contactCf = useCustomFields('contacts', contact?.id);

    useEffect(() => {
        if (open) {
            setForm(
                contact
                    ? { ...blank, ...contact, last_name: contact.last_name ?? '', phone: contact.phone ?? '', title: contact.title ?? '', password: '', permissions: contact.permissions ?? blank.permissions }
                    : // Settings → Customers: a new contact's customers-area permissions.
                      { ...blank, permissions: appOptions?.default_contact_permissions !== undefined ? appOptions.default_contact_permissions.split(',').filter(Boolean) : blank.permissions },
            );
            setErrors({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, contact, appOptions]);

    async function save() {
        if (!contactCf.validate()) {
            return;
        }
        setSaving(true);
        try {
            const { data } = contact ? await api.put<{ data: { id: number } }>(`/contacts/${contact.id}`, form) : await api.post<{ data: { id: number } }>(`/customers/${customerId}/contacts`, form);
            await contactCf.save(data.data.id);
            toast('Contact saved.');
            onSaved();
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={contact ? 'Edit Contact' : 'Add New Contact'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First Name" required error={errors.first_name}>
                    <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </Field>
                <Field label="Last Name">
                    <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </Field>
                <Field label="Position">
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </Field>
                <Field label="Email" required error={errors.email}>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Phone">
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <CustomFieldInputs cf={contactCf} className="sm:col-span-2" />
                <div className="flex flex-col gap-2 pt-6">
                    <Checkbox label="Primary Contact" checked={form.is_primary} onChange={(v) => setForm({ ...form, is_primary: v })} />
                    <Checkbox label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
                </div>
                <div className="space-y-3 rounded-lg border border-gray-200 p-3 sm:col-span-2">
                    <p className="text-[13.5px] font-medium">
                        Customers area login
                        <span className="ml-2 text-xs font-normal text-gray-500">
                            {contact?.has_password ? `Can log in at ${portalLoginUrl}` : 'No password yet'}
                            {contact?.last_login_at ? ` · last login ${formatDateTime(contact.last_login_at)}` : ''}
                        </span>
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                        <Field label={contact?.has_password ? 'New password (leave empty to keep)' : 'Password'} className="min-w-[14rem] flex-1">
                            <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                        </Field>
                        {contact && (
                            <Button variant="secondary" size="sm" onClick={() => api.post<{ message: string }>(`/contacts/${contact.id}/send-password-email`).then((r) => toast(r.data.message)).catch((e) => toast(errorMessage(e), 'error'))}>
                                Send set password email
                            </Button>
                        )}
                    </div>
                    <div>
                        <p className="mb-1.5 text-xs font-medium text-gray-500">Permissions in the customers area</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {PORTAL_PERMISSIONS.map(([key, label]) => (
                                <Checkbox
                                    key={key}
                                    label={label}
                                    checked={form.permissions.includes(key)}
                                    onChange={(v) => setForm({ ...form, permissions: v ? [...form.permissions, key] : form.permissions.filter((p) => p !== key) })}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 sm:col-span-2">
                    <p className="mb-2 text-[13.5px] font-medium">Email Notifications</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {EMAIL_PREFS.map(([key, label]) => (
                            <Checkbox key={key} label={label} checked={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} />
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function CustomerProjects({ customerId }: { customerId: number }) {
    const { data } = useApi<{ data: Project[] }>('/projects', { customer_id: customerId, status: [1, 2, 3, 4, 5], per_page: 100 });

    if (!data) {
        return <Spinner />;
    }

    return (
        <div className="panel_s overflow-hidden">
            <table className="table-perfex">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Project Name</th>
                        <th>Start Date</th>
                        <th>Deadline</th>
                        <th>Progress</th>
                    </tr>
                </thead>
                <tbody>
                    {data.data.map((p) => (
                        <tr key={p.id}>
                            <td>{p.id}</td>
                            <td>
                                <Link to={`/projects/${p.id}`}>{p.name}</Link>
                            </td>
                            <td>{p.start_date}</td>
                            <td>{p.deadline ?? '—'}</td>
                            <td>{p.calculated_progress}%</td>
                        </tr>
                    ))}
                    {data.data.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center text-gray-500">
                                No projects for this customer.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
