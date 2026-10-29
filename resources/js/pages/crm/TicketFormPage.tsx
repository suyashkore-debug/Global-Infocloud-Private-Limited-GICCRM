import { useEffect, useState } from 'react';
import { LifeBuoy, MessageSquareText, Send, UserRound } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useStaff } from '../../hooks/useStaff';
import { Button, ErrorNote, Field, FormSection, Input, Select, Spinner, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { CustomerFull, Ticket } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';
import { useAppOptions } from '../../hooks/useAppOptions';

type Option = { id: number; name: string };

/** Perfex "Open Ticket": for a customer contact, or for anyone by name and email. */
export default function TicketFormPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const [lists, setLists] = useState<{ customers: Option[]; departments: Option[]; priorities: Option[]; services: Option[] } | null>(null);
    const [contacts, setContacts] = useState<{ id: number; name: string; email: string }[]>([]);
    const [mode, setMode] = useState<'contact' | 'other'>('contact');
    const appOptions = useAppOptions();
    const [form, setForm] = useState({
        customer_id: params.get('customer_id') ?? '',
        contact_id: '',
        name: '',
        email: '',
        cc: '',
        subject: '',
        support_department_id: '',
        ticket_priority_id: '',
        ticket_service_id: '',
        assigned_id: '',
        message: '',
        tags: [] as string[],
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('tickets', null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: Option[] }>('/customers/options').catch(() => ({ data: { data: [] as Option[] } })),
            api.get<{ data: Option[] }>('/setup/support-departments'),
            api.get<{ data: Option[] }>('/setup/ticket-priorities'),
            api.get<{ data: Option[] }>('/setup/ticket-services'),
        ])
            .then(([c, d, p, s]) => {
                setLists({ customers: c.data.data, departments: d.data.data, priorities: p.data.data, services: s.data.data });
                setForm((f) => ({ ...f, support_department_id: String(d.data.data[0]?.id ?? ''), ticket_priority_id: String(p.data.data[1]?.id ?? p.data.data[0]?.id ?? '') }));
            })
            .catch((e) => setError(errorMessage(e)));
    }, []);

    useEffect(() => {
        if (!form.customer_id) {
            setContacts([]);
            return;
        }
        api.get<{ data: CustomerFull }>(`/customers/${form.customer_id}`)
            .then((r) => setContacts((r.data.data.contacts ?? []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name ?? ''}`.trim(), email: c.email }))))
            .catch(() => setContacts([]));
    }, [form.customer_id]);

    if (!lists) {
        return error ? <ErrorNote message={error} /> : <Spinner />;
    }

    const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        const payload = {
            subject: form.subject,
            message: form.message,
            cc: form.cc || null,
            contact_id: mode === 'contact' && form.contact_id ? Number(form.contact_id) : null,
            name: mode === 'other' ? form.name : null,
            email: mode === 'other' ? form.email : null,
            support_department_id: Number(form.support_department_id) || null,
            ticket_priority_id: Number(form.ticket_priority_id) || null,
            ticket_service_id: form.ticket_service_id ? Number(form.ticket_service_id) : null,
            assigned_id: form.assigned_id ? Number(form.assigned_id) : null,
            tags: form.tags,
        };
        try {
            const { data } = await api.post<{ data: Ticket }>('/tickets', payload);
            await cf.save(data.data.id);
            toast('Ticket opened.');
            navigate(`/tickets/${data.data.id}`);
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
                <h4 className="page-title">New Ticket</h4>
            </div>
            <ErrorNote message={error} />
            {lists.departments.length === 0 && <ErrorNote message="Add a support department first (Setup → Support Departments)." />}
            <div className="panel_s">
                <div className="panel-body space-y-4">
                    <FormSection icon={UserRound} title="Who is asking" hint="A customer's contact, or anyone by name and e-mail.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-wrap gap-2 sm:col-span-2">
                                {(
                                    [
                                        ['contact', 'Customer contact'],
                                        ['other', 'Ticket without contact'],
                                    ] as const
                                ).map(([value, label]) => (
                                    <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-semibold ring-1 transition ${mode === value ? 'bg-brand-50 text-brand ring-brand/30' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>
                                        <input type="radio" checked={mode === value} onChange={() => setMode(value)} /> {label}
                                    </label>
                                ))}
                            </div>
                            {mode === 'contact' ? (
                                <>
                                    <Field label="Customer">
                                        <Select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, contact_id: '' })}>
                                            <option value="">Select</option>
                                            {lists.customers.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    <Field label="Contact" required error={errors.contact_id ?? errors.name}>
                                        <Select value={form.contact_id} onChange={set('contact_id')} disabled={!form.customer_id}>
                                            <option value="">Select</option>
                                            {contacts.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} ({c.email})
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                </>
                            ) : (
                                <>
                                    <Field label="Name" required error={errors.name}>
                                        <Input value={form.name} onChange={set('name')} placeholder="Full name" />
                                    </Field>
                                    <Field label="Email" required error={errors.email}>
                                        <Input type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" />
                                    </Field>
                                </>
                            )}
                        </div>
                    </FormSection>

                    <FormSection icon={LifeBuoy} title="Ticket" hint="What it is about and who handles it.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Subject" required error={errors.subject} className="sm:col-span-2">
                                <Input value={form.subject} onChange={set('subject')} placeholder="Short summary of the problem" />
                            </Field>
                            <Field label="Department" required error={errors.support_department_id}>
                                <Select value={form.support_department_id} onChange={set('support_department_id')}>
                                    {lists.departments.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Priority" required error={errors.ticket_priority_id}>
                                <Select value={form.ticket_priority_id} onChange={set('ticket_priority_id')}>
                                    {lists.priorities.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            {appOptions?.ticket_services_enabled !== '0' && (
                                <Field label="Service">
                                    <Select value={form.ticket_service_id} onChange={set('ticket_service_id')}>
                                        <option value="">None</option>
                                        {lists.services.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            <Field label="Assign ticket (default is current user)">
                                <Select value={form.assigned_id} onChange={set('assigned_id')}>
                                    <option value="">Not assigned</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="CC">
                                <Input value={form.cc} onChange={set('cc')} placeholder="other@company.com" />
                            </Field>
                            <Field label="Tags">
                                <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
                            </Field>
                            <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                        </div>
                    </FormSection>

                    <FormSection icon={MessageSquareText} title="Message">
                        <Field label="Ticket Body" required error={errors.message}>
                            <Textarea rows={8} value={form.message} onChange={set('message')} placeholder="Describe the problem in detail…" />
                        </Field>
                    </FormSection>
                </div>
                <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
                    <Button onClick={save} loading={saving}>
                        <Send className="h-4 w-4" />
                        Open Ticket
                    </Button>
                </div>
            </div>
        </div>
    );
}
