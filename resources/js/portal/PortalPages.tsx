import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileSignature, FileText, FolderKanban, LifeBuoy, Megaphone, Plus, Receipt, Wallet } from 'lucide-react';
import { formatDate, formatDateTime, formatDuration, toIsoDate } from '../lib/format';
import { money } from '../lib/sales';
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui';
import { portalApi, portalError } from './api';
import { useContact } from './PortalLayout';
import { usePortal } from './usePortal';

type Currency = { symbol: string; placement: string } | null;

function Panel({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {(title || action) && (
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                    <h2 className="font-semibold text-gray-800">{title}</h2>
                    {action}
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    );
}

function Badge({ children, color = '#64748b' }: { children: ReactNode; color?: string }) {
    return (
        <span className="rounded border px-1.5 py-px text-xs font-medium" style={{ color, borderColor: color }}>
            {children}
        </span>
    );
}

const Table = ({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) => (
    <div className="-mx-5 overflow-x-auto">
        <table className="table-perfex">
            <thead>
                <tr>
                    {head.map((h) => (
                        <th key={h}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {children}
                {empty && (
                    <tr>
                        <td colSpan={head.length} className="text-center text-gray-500">
                            Nothing here yet.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    </div>
);

// Dashboard ---------------------------------------------------------------------------------------

type Dashboard = {
    invoices_unpaid: number;
    invoices_overdue: number;
    amount_due: number;
    currency: Currency;
    estimates_waiting: number | null;
    proposals_waiting: number | null;
    open_tickets: number | null;
    projects_in_progress: number | null;
    announcements: { id: number; name: string; message: string; created_at: string }[];
};

export function PortalDashboard() {
    const { contact } = useContact();
    const { data } = usePortal<{ data: Dashboard }>('/dashboard');
    if (!data) {
        return <Spinner />;
    }
    const d = data.data;
    const tiles: [string, ReactNode, string, boolean, typeof Wallet][] = [
        ['Amount due', money(d.amount_due, d.currency), '/portal/invoices', contact.permissions.includes('invoices'), Wallet],
        ['Unpaid invoices', `${d.invoices_unpaid}${d.invoices_overdue ? ` (${d.invoices_overdue} overdue)` : ''}`, '/portal/invoices', contact.permissions.includes('invoices'), Receipt],
        ['Estimates to review', d.estimates_waiting ?? 0, '/portal/estimates', d.estimates_waiting !== null, FileText],
        ['Proposals to review', d.proposals_waiting ?? 0, '/portal/proposals', d.proposals_waiting !== null, FileSignature],
        ['Open tickets', d.open_tickets ?? 0, '/portal/tickets', d.open_tickets !== null, LifeBuoy],
        ['Projects in progress', d.projects_in_progress ?? 0, '/portal/projects', d.projects_in_progress !== null, FolderKanban],
    ];

    return (
        <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2c56] via-[#123d73] to-[#1a4f8f] px-6 py-6 text-white shadow-lg shadow-brand/20 sm:px-8">
                <span className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[36px] border-white/5" />
                <span className="pointer-events-none absolute right-40 top-6 h-2.5 w-2.5 rounded-full bg-accent" />
                <p className="relative text-[13px] font-medium text-blue-100/70">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <h1 className="relative mt-1 text-[26px] font-bold leading-tight">Welcome, {contact.first_name} 👋</h1>
                <p className="relative mt-1 text-[14px] text-blue-100/80">{contact.company_name}</p>
            </div>
            {d.announcements.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent-50 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-accent shadow-sm">
                        <Megaphone className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{a.name}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-slate-600">{a.message}</p>
                    </div>
                </div>
            ))}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiles
                    .filter((t) => t[3])
                    .map(([label, value, to, , Icon]) => (
                        <Link key={label} to={to} className="group flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-md">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
                                <Icon className="h-[22px] w-[22px]" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium text-slate-500">{label}</p>
                                <p className="text-[22px] font-bold leading-tight text-slate-800">{value}</p>
                            </div>
                            <ChevronRight className="ml-auto h-5 w-5 text-slate-300 transition group-hover:text-brand" />
                        </Link>
                    ))}
            </div>
        </div>
    );
}

// Documents ---------------------------------------------------------------------------------------

type DocRow = Record<string, unknown> & { id: number; link: string; currency?: Currency };
const DOC_TITLES = { invoices: 'Invoices', estimates: 'Estimates', proposals: 'Proposals', contracts: 'Contracts' } as const;

export function PortalDocuments({ type }: { type: keyof typeof DOC_TITLES }) {
    const { data, error } = usePortal<{ data: DocRow[] }>(`/documents/${type}`);
    const rows = data?.data ?? [];
    const open = (r: DocRow) => window.open(r.link, '_blank', 'noopener');

    return (
        <Panel title={DOC_TITLES[type]}>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!data ? (
                <Spinner />
            ) : type === 'contracts' ? (
                <Table head={['Subject', 'Type', 'Start Date', 'End Date', 'Value', 'Signed']} empty={rows.length === 0}>
                    {rows.map((r) => (
                        <tr key={r.id} className="cursor-pointer" onClick={() => open(r)}>
                            <td className="font-medium text-blue-600">{r.subject as string}</td>
                            <td>{r.type as string}</td>
                            <td>{formatDate(r.start_date as string)}</td>
                            <td>{formatDate(r.end_date as string)}</td>
                            <td>{r.contract_value !== null ? money(r.contract_value as number) : ''}</td>
                            <td>{r.signed ? <Badge color="#16a34a">Signed</Badge> : <Badge>Not signed</Badge>}</td>
                        </tr>
                    ))}
                </Table>
            ) : (
                <Table head={[type === 'proposals' ? 'Proposal #' : 'Number', ...(type === 'proposals' ? ['Subject'] : []), 'Date', type === 'invoices' ? 'Due Date' : type === 'estimates' ? 'Expiry Date' : 'Open Till', 'Total', ...(type === 'invoices' ? ['Amount Due'] : []), 'Status']} empty={rows.length === 0}>
                    {rows.map((r) => (
                        <tr key={r.id} className="cursor-pointer" onClick={() => open(r)}>
                            <td className="font-medium text-blue-600">{r.number as string}</td>
                            {type === 'proposals' && <td>{r.subject as string}</td>}
                            <td>{formatDate(r.date as string)}</td>
                            <td>{formatDate((r.due_date ?? r.expiry_date ?? r.open_till) as string)}</td>
                            <td>{money(r.total as number, r.currency)}</td>
                            {type === 'invoices' && <td>{money(r.amount_due as number, r.currency)}</td>}
                            <td>
                                <Badge>{r.status as string}</Badge>
                            </td>
                        </tr>
                    ))}
                </Table>
            )}
        </Panel>
    );
}

// Statement ---------------------------------------------------------------------------------------

type Statement = { opening_balance: number; invoiced: number; paid: number; balance_due: number; lines: { date: string; details: string; amount: number; payment: number; balance: number }[] };

export function PortalStatement() {
    const now = new Date();
    const [from, setFrom] = useState(toIsoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
    const [to, setTo] = useState(toIsoDate(now));
    const { data } = usePortal<{ data: Statement }>('/statement', { from, to });
    const s = data?.data;

    return (
        <Panel
            title="Account Statement"
            action={
                <div className="flex gap-2">
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
                </div>
            }
        >
            {!s ? (
                <Spinner />
            ) : (
                <div className="space-y-4">
                    <div className="grid gap-3 text-[13px] sm:grid-cols-4">
                        {[
                            ['Beginning Balance', s.opening_balance],
                            ['Invoiced Amount', s.invoiced],
                            ['Amount Paid', s.paid],
                            ['Balance Due', s.balance_due],
                        ].map(([l, v]) => (
                            <div key={l as string} className="rounded-md bg-gray-50 p-3">
                                <p className="text-gray-500">{l}</p>
                                <p className="text-lg font-semibold">{money(v as number)}</p>
                            </div>
                        ))}
                    </div>
                    <Table head={['Date', 'Details', 'Amount', 'Payments', 'Balance']} empty={s.lines.length === 0}>
                        {s.lines.map((l, i) => (
                            <tr key={i}>
                                <td>{formatDate(l.date)}</td>
                                <td>{l.details}</td>
                                <td>{l.amount ? money(l.amount) : ''}</td>
                                <td>{l.payment ? money(l.payment) : ''}</td>
                                <td>{money(l.balance)}</td>
                            </tr>
                        ))}
                    </Table>
                </div>
            )}
        </Panel>
    );
}

// Support -----------------------------------------------------------------------------------------

type TicketRow = { id: number; subject: string; department: string | null; priority: string | null; status: { name: string; color: string } | null; last_reply_at: string | null; created_at: string };

export function PortalTickets() {
    const navigate = useNavigate();
    const { data } = usePortal<{ data: TicketRow[] }>('/tickets');
    const [open, setOpen] = useState(false);

    return (
        <Panel
            title="Support Tickets"
            action={
                <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> Open Ticket
                </Button>
            }
        >
            {!data ? (
                <Spinner />
            ) : (
                <Table head={['#', 'Subject', 'Department', 'Status', 'Priority', 'Last Reply']} empty={data.data.length === 0}>
                    {data.data.map((t) => (
                        <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/portal/tickets/${t.id}`)}>
                            <td>{t.id}</td>
                            <td className="font-medium text-blue-600">{t.subject}</td>
                            <td>{t.department}</td>
                            <td>{t.status && <Badge color={t.status.color}>{t.status.name}</Badge>}</td>
                            <td>{t.priority}</td>
                            <td>{t.last_reply_at ? formatDateTime(t.last_reply_at) : 'No reply yet'}</td>
                        </tr>
                    ))}
                </Table>
            )}
            {open && <NewTicketModal onClose={() => setOpen(false)} onCreated={(id) => navigate(`/portal/tickets/${id}`)} />}
        </Panel>
    );
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
    const { data } = usePortal<{ data: { departments: { id: number; name: string }[]; priorities: { id: number; name: string }[] } }>('/tickets/options');
    const [form, setForm] = useState({ subject: '', message: '', support_department_id: '', ticket_priority_id: '' });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const r = await portalApi.post<{ data: { id: number } }>('/tickets', {
                ...form,
                support_department_id: Number(form.support_department_id || data?.data.departments[0]?.id),
                ticket_priority_id: Number(form.ticket_priority_id || data?.data.priorities[1]?.id || data?.data.priorities[0]?.id),
            });
            onCreated(r.data.data.id);
        } catch (e) {
            setError(portalError(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            open
            title="Open Ticket"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} loading={busy} disabled={!form.subject.trim() || !form.message.trim()}>
                        Submit
                    </Button>
                </>
            }
        >
            {!data ? (
                <Spinner />
            ) : (
                <div className="space-y-3">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <Field label="Subject" required>
                        <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Department">
                            <Select value={form.support_department_id} onChange={(e) => setForm({ ...form, support_department_id: e.target.value })}>
                                {data.data.departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Priority">
                            <Select value={form.ticket_priority_id || String(data.data.priorities[1]?.id ?? '')} onChange={(e) => setForm({ ...form, ticket_priority_id: e.target.value })}>
                                {data.data.priorities.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                    <Field label="Message" required>
                        <Textarea rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                    </Field>
                    {data.data.departments.length === 0 && <p className="text-xs text-amber-700">No support departments are available yet. Please contact us by e-mail.</p>}
                </div>
            )}
        </Modal>
    );
}

type TicketDetail = {
    id: number;
    subject: string;
    message: string;
    department: string | null;
    priority: string | null;
    status: { name: string; color: string; closed: boolean } | null;
    created_at: string;
    from: string;
    replies: { id: number; message: string; author: string; is_staff: boolean; created_at: string }[];
};

export function PortalTicketView() {
    const { contact } = useContact();
    const { id } = useParams();
    const { data, reload } = usePortal<{ data: TicketDetail }>(`/tickets/${id}`);
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function send(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await portalApi.post(`/tickets/${id}/reply`, { message: reply });
            setReply('');
            reload();
        } catch (err) {
            setError(portalError(err));
        } finally {
            setBusy(false);
        }
    }

    if (!data) {
        return <Spinner />;
    }
    const t = data.data;

    return (
        <div className="space-y-4">
            <Link to="/portal/tickets" className="inline-flex items-center gap-1 text-[13px] text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4" /> All tickets
            </Link>
            <Panel
                title={`#${t.id} ${t.subject}`}
                action={
                    t.status && !t.status.closed && contact.can_close_tickets ? (
                        <Button size="sm" variant="secondary" onClick={() => portalApi.post(`/tickets/${id}/close`).then(reload)}>
                            Close Ticket
                        </Button>
                    ) : (
                        t.status && <Badge color={t.status.color}>{t.status.name}</Badge>
                    )
                }
            >
                <div className="mb-4 flex flex-wrap gap-4 text-[13px] text-gray-600">
                    <span>Department: {t.department}</span>
                    <span>Priority: {t.priority}</span>
                    {t.status && (
                        <span>
                            Status: <Badge color={t.status.color}>{t.status.name}</Badge>
                        </span>
                    )}
                </div>
                <ul className="space-y-3">
                    {[{ id: 0, message: t.message, author: t.from, is_staff: false, created_at: t.created_at }, ...t.replies].map((r) => (
                        <li key={r.id} className={`rounded-md border p-3 ${r.is_staff ? 'border-blue-100 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                            <p className="text-xs text-gray-500">
                                <span className="font-semibold text-gray-800">{r.author}</span> {r.is_staff && '(Staff)'} · {formatDateTime(r.created_at)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-[14px] text-gray-800">{r.message}</p>
                        </li>
                    ))}
                </ul>
                <form onSubmit={send} className="mt-4 space-y-2">
                    <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <Button type="submit" loading={busy} disabled={!reply.trim()}>
                        Add Reply
                    </Button>
                </form>
            </Panel>
        </div>
    );
}

// Projects ----------------------------------------------------------------------------------------

type ProjectRow = { id: number; name: string; status: string; status_id: number; start_date: string | null; deadline: string | null; progress: number };
type ProjectDetail = ProjectRow & {
    description: string | null;
    settings: Record<string, boolean>;
    total_logged_seconds: number | null;
    tasks: { id: number; name: string; status: string; priority: string; start_date: string | null; due_date: string | null; assignees: string[] }[];
    milestones: { id: number; name: string; description: string | null; due_date: string }[];
    members: { id: number; name: string | null }[];
    timesheets: { task: string | null; staff: string | null; start_time: string; end_time: string | null; seconds: number }[];
};

export function PortalProjects() {
    const navigate = useNavigate();
    const { data } = usePortal<{ data: ProjectRow[] }>('/projects');

    return (
        <Panel title="Projects">
            {!data ? (
                <Spinner />
            ) : (
                <Table head={['Project Name', 'Start Date', 'Deadline', 'Progress', 'Status']} empty={data.data.length === 0}>
                    {data.data.map((p) => (
                        <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/portal/projects/${p.id}`)}>
                            <td className="font-medium text-blue-600">{p.name}</td>
                            <td>{formatDate(p.start_date)}</td>
                            <td>{formatDate(p.deadline)}</td>
                            <td>{p.progress}%</td>
                            <td>
                                <Badge>{p.status}</Badge>
                            </td>
                        </tr>
                    ))}
                </Table>
            )}
        </Panel>
    );
}

export function PortalProjectView() {
    const { id } = useParams();
    const { data } = usePortal<{ data: ProjectDetail }>(`/projects/${id}`);
    const [tab, setTab] = useState<'overview' | 'tasks' | 'milestones' | 'timesheets'>('overview');
    const [taskId, setTaskId] = useState<number | null>(null);

    if (!data) {
        return <Spinner />;
    }
    const p = data.data;
    const tabs = [
        ['overview', 'Overview', true],
        ['tasks', `Tasks (${p.tasks.length})`, p.settings.view_tasks],
        ['milestones', 'Milestones', p.settings.view_milestones],
        ['timesheets', 'Timesheets', p.settings.view_timesheets],
    ].filter((t) => t[2]) as [typeof tab, string, boolean][];

    return (
        <div className="space-y-4">
            <Link to="/portal/projects" className="inline-flex items-center gap-1 text-[13px] text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4" /> All projects
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">{p.name}</h1>
            <div className="flex gap-1 border-b border-gray-200">
                {tabs.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? 'border-blue-600 text-gray-900' : 'border-transparent text-gray-500'}`}>
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'overview' && (
                <Panel>
                    <div className="space-y-4 text-[13.5px]">
                        <div>
                            <div className="mb-1 flex justify-between">
                                <span className="font-medium">Progress</span>
                                <span>{p.progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-200">
                                <div className="h-full rounded-full bg-brand" style={{ width: `${p.progress}%` }} />
                            </div>
                        </div>
                        <dl className="grid gap-3 sm:grid-cols-4">
                            <div>
                                <dt className="text-gray-500">Status</dt>
                                <dd className="font-medium">{p.status}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Start Date</dt>
                                <dd className="font-medium">{formatDate(p.start_date)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Deadline</dt>
                                <dd className="font-medium">{formatDate(p.deadline)}</dd>
                            </div>
                            {p.total_logged_seconds !== null && (
                                <div>
                                    <dt className="text-gray-500">Logged time</dt>
                                    <dd className="font-medium">{formatDuration(p.total_logged_seconds) || '0:00'}</dd>
                                </div>
                            )}
                        </dl>
                        {p.description && <p className="whitespace-pre-wrap text-gray-700">{p.description}</p>}
                        {p.members.length > 0 && (
                            <div>
                                <p className="mb-1 font-medium">Team</p>
                                <p className="text-gray-700">{p.members.map((m) => m.name).filter(Boolean).join(', ')}</p>
                            </div>
                        )}
                    </div>
                </Panel>
            )}
            {tab === 'tasks' && (
                <Panel>
                    <Table head={['Name', 'Status', 'Priority', 'Start Date', 'Due Date', 'Assigned']} empty={p.tasks.length === 0}>
                        {p.tasks.map((t) => (
                            <tr key={t.id} className="cursor-pointer" onClick={() => setTaskId(t.id)}>
                                <td className="font-medium text-blue-600">{t.name}</td>
                                <td>{t.status}</td>
                                <td>{t.priority}</td>
                                <td>{formatDate(t.start_date)}</td>
                                <td>{formatDate(t.due_date)}</td>
                                <td>{p.settings.view_team_members ? t.assignees.join(', ') : ''}</td>
                            </tr>
                        ))}
                    </Table>
                </Panel>
            )}
            {tab === 'milestones' && (
                <Panel>
                    <Table head={['Milestone', 'Due Date', 'Description']} empty={p.milestones.length === 0}>
                        {p.milestones.map((m) => (
                            <tr key={m.id}>
                                <td className="font-medium">{m.name}</td>
                                <td>{formatDate(m.due_date)}</td>
                                <td className="text-gray-600">{m.description}</td>
                            </tr>
                        ))}
                    </Table>
                </Panel>
            )}
            {tab === 'timesheets' && (
                <Panel>
                    <Table head={['Task', 'Staff', 'Start', 'End', 'Time']} empty={p.timesheets.length === 0}>
                        {p.timesheets.map((t, i) => (
                            <tr key={i}>
                                <td>{t.task}</td>
                                <td>{t.staff}</td>
                                <td>{formatDateTime(t.start_time)}</td>
                                <td>{t.end_time ? formatDateTime(t.end_time) : 'Running'}</td>
                                <td>{formatDuration(t.seconds) || '0:00'}</td>
                            </tr>
                        ))}
                    </Table>
                </Panel>
            )}
            {taskId && <PortalTaskModal projectId={p.id} taskId={taskId} onClose={() => setTaskId(null)} />}
        </div>
    );
}

type TaskDetail = {
    id: number;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    start_date: string | null;
    due_date: string | null;
    logged_seconds: number | null;
    checklist: { id: number; description: string; finished: boolean }[];
    can_comment: boolean;
    comments: { id: number; content: string; author: string; is_customer: boolean; created_at: string }[];
};

function PortalTaskModal({ projectId, taskId, onClose }: { projectId: number; taskId: number; onClose: () => void }) {
    const { data, reload } = usePortal<{ data: TaskDetail }>(`/projects/${projectId}/tasks/${taskId}`);
    const [comment, setComment] = useState('');
    const t = data?.data;

    async function send() {
        await portalApi.post(`/projects/${projectId}/tasks/${taskId}/comments`, { content: comment });
        setComment('');
        reload();
    }

    return (
        <Modal open size="lg" title={t?.name ?? 'Task'} onClose={onClose}>
            {!t ? (
                <Spinner />
            ) : (
                <div className="space-y-4 text-[13.5px]">
                    <div className="flex flex-wrap gap-4 text-gray-600">
                        <span>Status: {t.status}</span>
                        <span>Priority: {t.priority}</span>
                        <span>Start: {formatDate(t.start_date)}</span>
                        <span>Due: {formatDate(t.due_date)}</span>
                        {t.logged_seconds !== null && <span>Logged: {formatDuration(t.logged_seconds) || '0:00'}</span>}
                    </div>
                    {t.description && <p className="whitespace-pre-wrap text-gray-800">{t.description}</p>}
                    {t.checklist.length > 0 && (
                        <ul className="space-y-1">
                            {t.checklist.map((c) => (
                                <li key={c.id} className={c.finished ? 'text-gray-400 line-through' : ''}>
                                    {c.finished ? '☑' : '☐'} {c.description}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div>
                        <p className="mb-2 font-semibold">Comments</p>
                        <ul className="space-y-2">
                            {t.comments.map((c) => (
                                <li key={c.id} className={`rounded-md p-2.5 ${c.is_customer ? 'bg-gray-50' : 'bg-blue-50'}`}>
                                    <p className="text-xs text-gray-500">
                                        <span className="font-semibold text-gray-800">{c.author}</span> · {formatDateTime(c.created_at)}
                                    </p>
                                    <p className="mt-0.5 whitespace-pre-wrap">{c.content}</p>
                                </li>
                            ))}
                            {t.comments.length === 0 && <li className="text-gray-500">No comments yet.</li>}
                        </ul>
                        {t.can_comment && (
                            <div className="mt-3 space-y-2">
                                <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
                                <Button size="sm" onClick={send} disabled={!comment.trim()}>
                                    Add Comment
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}

// Knowledge base ----------------------------------------------------------------------------------

export function PortalKnowledgeBase() {
    const { data } = usePortal<{ data: { id: number; name: string; description: string | null; color: string; articles: { id: number; subject: string }[] }[] }>('/knowledge-base');
    const [article, setArticle] = useState<number | null>(null);
    const art = usePortal<{ data: { id: number; subject: string; description: string | null } }>(article ? `/knowledge-base/${article}` : null);

    return (
        <Panel title="Knowledge Base">
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <p className="text-[13.5px] text-gray-500">No articles yet.</p>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                    {data.data.map((g) => (
                        <div key={g.id}>
                            <h3 className="mb-1 font-semibold" style={{ color: g.color }}>
                                {g.name}
                            </h3>
                            {g.description && <p className="mb-2 text-[13px] text-gray-500">{g.description}</p>}
                            <ul className="space-y-1">
                                {g.articles.map((a) => (
                                    <li key={a.id}>
                                        <button type="button" onClick={() => setArticle(a.id)} className="text-left text-[13.5px] text-blue-600 hover:underline">
                                            {a.subject}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
            {article && (
                <Modal open size="lg" title={art.data?.data.subject ?? 'Article'} onClose={() => setArticle(null)}>
                    {!art.data ? <Spinner /> : <div className="whitespace-pre-wrap text-[14px] text-gray-800">{art.data.data.description}</div>}
                </Modal>
            )}
        </Panel>
    );
}

// Profile & company -------------------------------------------------------------------------------

export function PortalProfile() {
    const { contact, reload } = useContact();
    const [form, setForm] = useState({ first_name: contact.first_name, last_name: contact.last_name ?? '', phone: contact.phone ?? '', title: contact.title ?? '' });
    const [pw, setPw] = useState({ old_password: '', password: '', password_confirmation: '' });
    const [msg, setMsg] = useState<string | null>(null);
    const [pwMsg, setPwMsg] = useState<string | null>(null);

    async function save() {
        try {
            await portalApi.put('/profile', form);
            setMsg('Profile updated.');
            reload();
        } catch (e) {
            setMsg(portalError(e));
        }
    }

    async function change() {
        try {
            await portalApi.post('/profile/password', pw);
            setPw({ old_password: '', password: '', password_confirmation: '' });
            setPwMsg('Password changed.');
        } catch (e) {
            setPwMsg(portalError(e));
        }
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Profile">
                <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="First Name">
                            <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                        </Field>
                        <Field label="Last Name">
                            <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                        </Field>
                        <Field label="Position">
                            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                        </Field>
                        <Field label="Phone">
                            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        </Field>
                    </div>
                    <Field label="Email">
                        <Input value={contact.email} disabled />
                    </Field>
                    {msg && <p className="text-[13px] text-gray-700">{msg}</p>}
                    <Button onClick={save}>Save</Button>
                </div>
            </Panel>
            <Panel title="Change Password">
                <div className="space-y-3">
                    <Field label="Old Password">
                        <Input type="password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} />
                    </Field>
                    <Field label="New Password">
                        <Input type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
                    </Field>
                    <Field label="Repeat New Password">
                        <Input type="password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} />
                    </Field>
                    {pwMsg && <p className="text-[13px] text-gray-700">{pwMsg}</p>}
                    <Button onClick={change} disabled={!pw.old_password || !pw.password}>
                        Change Password
                    </Button>
                </div>
            </Panel>
        </div>
    );
}

const COMPANY_FIELDS: [string, string][] = [
    ['phone', 'Phone'],
    ['website', 'Website'],
    ['address', 'Address'],
    ['city', 'City'],
    ['state', 'State'],
    ['zip', 'Zip Code'],
    ['country', 'Country'],
    ['billing_street', 'Billing Street'],
    ['billing_city', 'Billing City'],
    ['billing_state', 'Billing State'],
    ['billing_zip', 'Billing Zip'],
    ['billing_country', 'Billing Country'],
];

export function PortalCompany() {
    const { contact } = useContact();
    const { data } = usePortal<{ data: Record<string, string | null> }>('/company');
    const [form, setForm] = useState<Record<string, string> | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const values = form ?? Object.fromEntries(Object.entries(data?.data ?? {}).map(([k, v]) => [k, v ?? '']));

    async function save() {
        try {
            await portalApi.put('/company', values);
            setMsg('Company details updated.');
        } catch (e) {
            setMsg(portalError(e));
        }
    }

    return (
        <Panel title={data?.data.name ?? 'Company'}>
            {!data ? (
                <Spinner />
            ) : (
                <div className="space-y-3">
                    {!contact.can_edit_company && (
                        <p className="rounded-md bg-gray-50 p-2 text-[13px] text-gray-600">{contact.is_primary ? 'Please contact us to change the company details.' : 'Only the primary contact can change the company details.'}</p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                        {COMPANY_FIELDS.map(([key, label]) => (
                            <Field key={key} label={label}>
                                <Input value={values[key] ?? ''} disabled={!contact.can_edit_company} onChange={(e) => setForm({ ...values, [key]: e.target.value })} />
                            </Field>
                        ))}
                    </div>
                    {data.data.vat && <p className="text-[13px] text-gray-600">GSTIN: {data.data.vat}</p>}
                    {msg && <p className="text-[13px] text-gray-700">{msg}</p>}
                    {contact.can_edit_company && <Button onClick={save}>Save</Button>}
                </div>
            )}
        </Panel>
    );
}
