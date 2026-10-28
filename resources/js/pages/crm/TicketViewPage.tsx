import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Paperclip } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { Button, ErrorNote, Field, Select, Spinner, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { AttachmentList } from '../../components/comments/AttachmentList';
import { NotesPanel } from '../../components/records/RecordPanels';
import type { Ticket, TicketStatus } from '../../types';
import { CustomFieldsView } from '../../components/customfields/CustomFields';
import { useAppOptions } from '../../hooks/useAppOptions';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

type Option = { id: number; name: string };

export default function TicketViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const { data, error, setData } = useApi<{ data: Ticket }>(`/tickets/${id}`);
    const [tab, setTab] = useState<'reply' | 'notes' | 'settings'>('reply');
    const [statuses, setStatuses] = useState<TicketStatus[]>([]);
    const [lists, setLists] = useState<{ departments: Option[]; priorities: Option[]; services: Option[]; replies: { id: number; name: string; message: string }[] }>({ departments: [], priorities: [], services: [], replies: [] });
    const [message, setMessage] = useState('');
    const [replyStatus, setReplyStatus] = useState('');
    const appOptions = useAppOptions();
    // Settings → Support: the status a reply sets unless chosen otherwise.
    useEffect(() => {
        if (appOptions?.default_ticket_reply_status) {
            setReplyStatus((s) => s || appOptions.default_ticket_reply_status);
        }
    }, [appOptions]);
    const [files, setFiles] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const ticket = data?.data;
    usePageCrumb(ticket ? `#${ticket.id} ${ticket.subject}` : null);

    useEffect(() => {
        Promise.all([
            api.get<{ data: TicketStatus[] }>('/setup/ticket-statuses'),
            api.get<{ data: Option[] }>('/setup/support-departments'),
            api.get<{ data: Option[] }>('/setup/ticket-priorities'),
            api.get<{ data: Option[] }>('/setup/ticket-services'),
            api.get<{ data: { id: number; name: string; message: string }[] }>('/setup/predefined-replies'),
        ]).then(([s, d, p, sv, r]) => {
            setStatuses(s.data.data);
            setReplyStatus(String(s.data.data.find((x) => x.system_key === 'answered')?.id ?? ''));
            setLists({ departments: d.data.data, priorities: p.data.data, services: sv.data.data, replies: r.data.data });
        });
    }, []);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!ticket) {
        return <Spinner />;
    }

    async function reply() {
        if (!message.trim()) {
            return;
        }
        setSending(true);
        const body = new FormData();
        body.append('message', message);
        if (replyStatus) {
            body.append('ticket_status_id', replyStatus);
        }
        files.forEach((f) => body.append('files[]', f));
        try {
            const { data: r } = await api.post<{ data: Ticket }>(`/tickets/${ticket!.id}/reply`, body);
            setData(r);
            setMessage('');
            setFiles([]);
            toast('Reply added.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSending(false);
        }
    }

    async function changeStatus(statusId: string) {
        const { data: r } = await api.post<{ data: Ticket }>(`/tickets/${ticket!.id}/status`, { ticket_status_id: Number(statusId) });
        setData(r);
        toast('Status changed.');
    }

    async function saveSettings(patch: Record<string, unknown>) {
        try {
            const { data: r } = await api.put<{ data: Ticket }>(`/tickets/${ticket!.id}`, {
                subject: ticket!.subject,
                contact_id: ticket!.contact?.id ?? null,
                name: ticket!.contact ? null : ticket!.name,
                email: ticket!.contact ? null : ticket!.email,
                support_department_id: ticket!.department?.id,
                ticket_priority_id: ticket!.priority?.id,
                ticket_service_id: ticket!.service?.id ?? null,
                assigned_id: ticket!.assigned?.id ?? null,
                ...patch,
            });
            setData(r);
            toast('Ticket updated.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm('Delete this ticket?')) {
            return;
        }
        try {
            await api.delete(`/tickets/${ticket!.id}`);
            toast('Ticket deleted.');
            navigate('/tickets');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-2 flex items-center gap-2">
                    #{ticket.id} - {ticket.subject} {ticket.status && <StatusBadge option={{ id: ticket.status.id, name: ticket.status.name, color: ticket.status.color }} />}
                </h4>
                <div className="ml-auto flex items-center gap-2">
                    <Select value={String(ticket.status?.id ?? '')} onChange={(e) => changeStatus(e.target.value)} className="w-auto">
                        {statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </Select>
                    {ticket.can.delete && (
                        <Button variant="danger" onClick={remove}>
                            Delete
                        </Button>
                    )}
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body grid gap-4 text-[13.5px] sm:grid-cols-3 lg:grid-cols-6">
                    <Info label="Contact">
                        {ticket.requester}
                        {ticket.email && <span className="block text-xs text-gray-500">{ticket.email}</span>}
                    </Info>
                    <Info label="Customer">{ticket.customer ? <Link to={`/customers/${ticket.customer.id}`}>{ticket.customer.name}</Link> : '—'}</Info>
                    <Info label="Department">{ticket.department?.name}</Info>
                    <Info label="Priority">{ticket.priority?.name}</Info>
                    <Info label="Assigned">{ticket.assigned?.full_name ?? '—'}</Info>
                    <Info label="Created">{formatDateTime(ticket.created_at)}</Info>
                    <CustomFieldsView to="tickets" id={ticket.id} className="border-t border-gray-100 pt-3" />
                </div>
            </div>

            <Tabs
                tabs={[
                    { id: 'reply', label: 'Add Reply' },
                    { id: 'notes', label: 'Add Note' },
                    { id: 'settings', label: 'Settings' },
                ]}
                active={tab}
                onChange={setTab}
            />

            <div className="panel_s">
                <div className="panel-body">
                    {tab === 'reply' && (
                        <div className="space-y-3">
                            {lists.replies.length > 0 && (
                                <Select value="" onChange={(e) => setMessage((m) => `${m}${m ? '\n' : ''}${lists.replies.find((r) => String(r.id) === e.target.value)?.message ?? ''}`)} className="w-auto">
                                    <option value="">Insert predefined reply</option>
                                    {lists.replies.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name}
                                        </option>
                                    ))}
                                </Select>
                            )}
                            <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your reply…" />
                            <div className="flex flex-wrap items-center gap-3">
                                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-gray-600">
                                    <Paperclip className="h-4 w-4" /> {files.length ? files.map((f) => f.name).join(', ') : 'Attach files'}
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        accept={appOptions?.ticket_attachments_file_extensions || undefined}
                                        onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, Number(appOptions?.maximum_allowed_ticket_attachments || 10)))}
                                    />
                                </label>
                                <div className="ml-auto flex items-center gap-2">
                                    <span className="text-[13px] text-gray-600">Change status:</span>
                                    <Select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)} className="w-auto">
                                        {statuses.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                    <Button onClick={reply} loading={sending}>
                                        Add Response
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    {tab === 'notes' && <NotesPanel type="ticket" id={ticket.id} />}
                    {tab === 'settings' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Department">
                                <Select value={String(ticket.department?.id ?? '')} onChange={(e) => saveSettings({ support_department_id: Number(e.target.value) })}>
                                    {lists.departments.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Priority">
                                <Select value={String(ticket.priority?.id ?? '')} onChange={(e) => saveSettings({ ticket_priority_id: Number(e.target.value) })}>
                                    {lists.priorities.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            {appOptions?.ticket_services_enabled !== '0' && (
                                <Field label="Service">
                                    <Select value={String(ticket.service?.id ?? '')} onChange={(e) => saveSettings({ ticket_service_id: e.target.value ? Number(e.target.value) : null })}>
                                        <option value="">None</option>
                                        {lists.services.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            <Field label="Assigned">
                                <Select value={String(ticket.assigned?.id ?? '')} onChange={(e) => saveSettings({ assigned_id: e.target.value ? Number(e.target.value) : null })}>
                                    <option value="">Not assigned</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {[...(ticket.replies ?? [])].reverse().map((r) => (
                    <div key={r.id} className={`panel_s !mb-0 border-l-4 ${r.is_staff ? '!border-l-blue-500' : '!border-l-amber-500'}`}>
                        <div className="panel-body !py-4">
                            <p className="text-xs text-gray-500">
                                <span className="font-semibold text-gray-800">{r.author}</span> {r.is_staff ? '(Staff)' : '(Customer)'} · {formatDateTime(r.created_at)}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-[13.5px]">{r.message}</p>
                            {r.attachments.length > 0 && (
                                <div className="mt-2">
                                    <AttachmentList files={r.attachments} canDelete={() => false} onDelete={() => {}} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div className="panel_s !mb-0 border-l-4 !border-l-amber-500">
                    <div className="panel-body !py-4">
                        <p className="text-xs text-gray-500">
                            <span className="font-semibold text-gray-800">{ticket.requester}</span> · {formatDateTime(ticket.created_at)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-[13.5px]">{ticket.message}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-gray-500">{label}</p>
            <div className="font-medium">{children}</div>
        </div>
    );
}
