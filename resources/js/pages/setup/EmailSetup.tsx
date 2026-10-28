import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Pagination, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type EmailSettings = {
    smtp_host: string;
    smtp_port: string;
    smtp_encryption: string;
    smtp_username: string;
    smtp_email: string;
    smtp_from_name: string;
    email_signature: string;
    email_header: string;
    email_footer: string;
    has_password: boolean;
    default_mailer: string;
};

/** Perfex Setup → Settings → Email: SMTP account, signature, header / footer, test e-mail. */
export function EmailSettingsForm() {
    const toast = useToast();
    const { data } = useApi<{ data: EmailSettings }>('/settings/email');
    const [form, setForm] = useState<EmailSettings | null>(null);
    const [password, setPassword] = useState('');
    const [testTo, setTestTo] = useState('');
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (data) {
            setForm(data.data);
        }
    }, [data]);

    if (!form) {
        return <Spinner />;
    }
    const set = (patch: Partial<EmailSettings>) => setForm({ ...form, ...patch });

    async function save() {
        setSaving(true);
        setError(null);
        try {
            const res = await api.put<{ data: EmailSettings }>('/settings/email', { ...form, smtp_port: form!.smtp_port ? Number(form!.smtp_port) : null, smtp_password: password || undefined });
            setForm(res.data.data);
            setPassword('');
            toast('E-mail settings saved.');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    async function test() {
        setTesting(true);
        try {
            const res = await api.post<{ message: string }>('/settings/email/test', { to: testTo });
            toast(res.data.message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setTesting(false);
        }
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel_s">
                <div className="panel-body space-y-3">
                    <h5 className="text-[15px] font-semibold">SMTP Settings</h5>
                    <p className="text-xs text-gray-500">Set up your e-mail account (e.g. Gmail / Outlook / your mail server). Until this is filled in, e-mails are only written to the log file.</p>
                    <ErrorNote message={error} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="SMTP Host" className="sm:col-span-2">
                            <Input value={form.smtp_host} onChange={(e) => set({ smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
                        </Field>
                        <Field label="SMTP Port">
                            <Input value={form.smtp_port} onChange={(e) => set({ smtp_port: e.target.value })} placeholder="587" />
                        </Field>
                        <Field label="Email Encryption">
                            <Select value={form.smtp_encryption} onChange={(e) => set({ smtp_encryption: e.target.value })}>
                                <option value="">None</option>
                                <option value="tls">TLS</option>
                                <option value="ssl">SSL</option>
                            </Select>
                        </Field>
                        <Field label="SMTP Username">
                            <Input value={form.smtp_username} onChange={(e) => set({ smtp_username: e.target.value })} autoComplete="off" />
                        </Field>
                        <Field label="SMTP Password" hint={form.has_password ? 'A password is saved. Leave empty to keep it.' : undefined}>
                            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                        </Field>
                        <Field label="Email (from address)">
                            <Input value={form.smtp_email} onChange={(e) => set({ smtp_email: e.target.value })} placeholder="accounts@globalinfocloud.com" />
                        </Field>
                        <Field label="From name">
                            <Input value={form.smtp_from_name} onChange={(e) => set({ smtp_from_name: e.target.value })} />
                        </Field>
                    </div>
                    <Field label="Email Signature" hint="Used by the {email_signature} merge field.">
                        <Textarea rows={4} value={form.email_signature} onChange={(e) => set({ email_signature: e.target.value })} />
                    </Field>
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </div>
            </div>
            <div className="space-y-4">
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <h5 className="text-[15px] font-semibold">Send Test Email</h5>
                        <p className="text-xs text-gray-500">Save the settings first, then send a test to check they work.</p>
                        <div className="flex gap-2">
                            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
                            <Button variant="secondary" onClick={test} loading={testing} disabled={!testTo}>
                                Test
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <h5 className="text-[15px] font-semibold">Predefined Header / Footer</h5>
                        <p className="text-xs text-gray-500">HTML wrapped around every e-mail. Leave empty for the default layout.</p>
                        <Field label="Email Header">
                            <Textarea rows={4} value={form.email_header} onChange={(e) => set({ email_header: e.target.value })} className="font-mono text-xs" />
                        </Field>
                        <Field label="Email Footer">
                            <Textarea rows={3} value={form.email_footer} onChange={(e) => set({ email_footer: e.target.value })} className="font-mono text-xs" />
                        </Field>
                    </div>
                </div>
            </div>
        </div>
    );
}

type TemplateRow = { id: number; type: string; slug: string; name: string; subject: string; active: boolean };
type Template = TemplateRow & { message: string; from_name: string | null; plaintext: boolean };

const TYPE_LABELS: Record<string, string> = {
    client: 'Customers',
    invoice: 'Invoices',
    estimate: 'Estimates',
    proposals: 'Proposals',
    credit_note: 'Credit Notes',
    contract: 'Contracts',
    tasks: 'Tasks',
    project: 'Projects',
    staff: 'Staff',
    leads: 'Leads',
    ticket: 'Tickets',
    subscriptions: 'Subscriptions',
};

/** Perfex Setup → Email Templates: grouped by module, enable / disable and edit each one. */
export function EmailTemplatesList() {
    const toast = useToast();
    const { data, reload } = useApi<{ data: TemplateRow[] }>('/email-templates');
    const [editing, setEditing] = useState<number | null>(null);

    if (!data) {
        return <Spinner />;
    }
    const groups = Object.entries(
        data.data.reduce<Record<string, TemplateRow[]>>((acc, t) => {
            (acc[t.type] ??= []).push(t);
            return acc;
        }, {}),
    );

    async function toggleType(type: string, active: boolean) {
        await api.post(`/email-templates/type/${type}`, { active });
        toast(active ? 'Templates enabled.' : 'Templates disabled.');
        reload();
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {groups.map(([type, rows]) => (
                <div key={type} className="panel_s">
                    <div className="panel-body">
                        <div className="mb-2 flex items-center justify-between">
                            <h5 className="text-[15px] font-semibold">{TYPE_LABELS[type] ?? type}</h5>
                            <div className="flex gap-3 text-xs">
                                <button type="button" onClick={() => toggleType(type, true)} className="text-blue-600 hover:underline">
                                    Enable all
                                </button>
                                <button type="button" onClick={() => toggleType(type, false)} className="text-gray-500 hover:underline">
                                    Disable all
                                </button>
                            </div>
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {rows.map((t) => (
                                <li key={t.id} className="flex items-center gap-2 py-2 text-[13px]">
                                    <button type="button" onClick={() => setEditing(t.id)} className={`flex-1 text-left hover:underline ${t.active ? 'text-blue-700' : 'text-gray-400'}`}>
                                        {t.name}
                                    </button>
                                    <span className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase ${t.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.active ? 'On' : 'Off'}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            ))}
            {editing && (
                <TemplateEditor
                    id={editing}
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

function TemplateEditor({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const { data } = useApi<{ data: Template; meta: { merge_fields: string[] } }>(`/email-templates/${id}`);
    const [form, setForm] = useState<Template | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (data) {
            setForm(data.data);
        }
    }, [data]);

    async function save() {
        setSaving(true);
        try {
            await api.put(`/email-templates/${id}`, { subject: form!.subject, message: form!.message, from_name: form!.from_name, plaintext: form!.plaintext, active: form!.active });
            toast('Template saved.');
            onSaved();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            size="xl"
            title={form?.name ?? 'Email template'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!form}>
                        Save
                    </Button>
                </>
            }
        >
            {!form || !data ? (
                <Spinner />
            ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-3">
                        <Field label="Subject">
                            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                        </Field>
                        <Field label="From name">
                            <Input value={form.from_name ?? ''} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
                        </Field>
                        <Field label="Message (HTML)">
                            <Textarea rows={12} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="font-mono text-xs" />
                        </Field>
                        <div className="flex flex-wrap gap-4">
                            <Checkbox label="Active (send this e-mail)" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
                            <Checkbox label="Send as plain text" checked={form.plaintext} onChange={(v) => setForm({ ...form, plaintext: v })} />
                        </div>
                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-500">Preview</p>
                            <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-[13px]" dangerouslySetInnerHTML={{ __html: sanitize(form.message) }} />
                        </div>
                    </div>
                    <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Merge fields</p>
                        <p className="mb-2 text-xs text-gray-500">Click to add to the message.</p>
                        <div className="flex max-h-[28rem] flex-wrap gap-1 overflow-y-auto">
                            {data.meta.merge_fields.map((f) => (
                                <button key={f} type="button" onClick={() => setForm({ ...form, message: `${form.message}{${f}}` })} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:bg-blue-50">
                                    {`{${f}}`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/** Admin-written template HTML shown in the preview without scripts or event handlers. */
function sanitize(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, style, link, meta').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) {
                el.removeAttribute(attr.name);
            }
        }
    });

    return doc.body.innerHTML;
}

type LogRow = { id: number; template: string | null; to: string; cc: string | null; subject: string; status: string; error: string | null; created_at: string };

/** Every e-mail the app sent (or tried to). */
export function EmailLogList() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const { data } = useApi<{ data: LogRow[]; meta: { current_page: number; last_page: number; total: number } }>('/email-logs', { page, status: status || undefined, search: search || undefined });

    return (
        <div className="panel_s">
            <div className="panel-body space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-40">
                        <option value="">All</option>
                        <option value="sent">Sent</option>
                        <option value="queued">Queued</option>
                        <option value="failed">Failed</option>
                    </Select>
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search to / subject..." className="w-64" />
                </div>
                {!data ? (
                    <Spinner />
                ) : (
                    <>
                        <div className="-mx-4 overflow-x-auto">
                            <table className="table-perfex">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>To</th>
                                        <th>Subject</th>
                                        <th>Template</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.data.map((l) => (
                                        <tr key={l.id}>
                                            <td className="whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                                            <td>
                                                {l.to}
                                                {l.cc && <span className="block text-xs text-gray-500">CC: {l.cc}</span>}
                                            </td>
                                            <td>{l.subject}</td>
                                            <td className="text-xs text-gray-500">{l.template}</td>
                                            <td>
                                                <span className={`rounded px-1.5 py-px text-xs font-medium ${l.status === 'sent' ? 'bg-green-50 text-green-700' : l.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`} title={l.error ?? ''}>
                                                    {l.status}
                                                </span>
                                                {l.error && <span className="block max-w-xs truncate text-xs text-red-600" title={l.error}>{l.error}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {data.data.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center text-gray-500">
                                                No e-mails yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </>
                )}
            </div>
        </div>
    );
}
