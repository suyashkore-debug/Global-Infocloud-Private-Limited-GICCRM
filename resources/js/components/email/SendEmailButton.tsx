import { useState } from 'react';
import { CalendarClock, Mail } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Spinner, Textarea } from '../ui';
import { useToast } from '../ui/Toast';

type Preview = {
    recipients: { contact_id: number | null; name: string; email: string; checked: boolean }[];
    template: { slug: string; name: string | null; subject: string | null; message: string | null; active: boolean | null };
    already_sent: boolean;
    can_schedule: boolean;
    schedule: { id: number; scheduled_at: string; recipients: string[]; cc: string | null; attach_pdf: boolean } | null;
    logs: { id: number; to: string; subject: string; status: string; error: string | null; created_at: string }[];
};

/** Perfex's default schedule time: tomorrow at 8:00, as a datetime-local value. */
function tomorrowAtEight(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`;
}

/** An ISO time as a local datetime-local value. */
function toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type EmailDocumentType = 'invoices' | 'estimates' | 'proposals' | 'credit-notes' | 'contracts';

/** Perfex "Send to Email" button + dialog for a sales document or contract. */
export default function SendEmailButton({ type, id, onSent }: { type: EmailDocumentType; id: number; onSent?: () => void }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button variant="secondary" onClick={() => setOpen(true)} title="Send to Email">
                <Mail className="h-4 w-4" /> Send
            </Button>
            {open && (
                <SendEmailModal
                    type={type}
                    id={id}
                    onClose={() => setOpen(false)}
                    onSent={() => {
                        setOpen(false);
                        onSent?.();
                    }}
                />
            )}
        </>
    );
}

function SendEmailModal({ type, id, onClose, onSent }: { type: EmailDocumentType; id: number; onClose: () => void; onSent: () => void }) {
    const toast = useToast();
    const { data, error, reload } = useApi<{ data: Preview }>(`/${type}/${id}/email`);
    const [later, setLater] = useState(false);
    const [at, setAt] = useState(tomorrowAtEight());
    const [chosen, setChosen] = useState<string[] | null>(null);
    const [extra, setExtra] = useState('');
    const [cc, setCc] = useState('');
    const [attach, setAttach] = useState(true);
    const [edit, setEdit] = useState<{ subject: string; message: string } | null>(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);

    const preview = data?.data;
    const selected = chosen ?? preview?.recipients.filter((r) => r.checked).map((r) => r.email) ?? [];
    const extraEmails = extra.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    const recipients = [...new Set([...selected, ...extraEmails])];
    const toggle = (email: string) => setChosen(selected.includes(email) ? selected.filter((e) => e !== email) : [...selected, email]);

    async function send() {
        setSending(true);
        setSendError(null);
        try {
            const res = await api.post<{ message: string }>(`/${type}/${id}/email`, {
                recipients,
                cc,
                attach_pdf: attach,
                subject: edit?.subject,
                message: edit?.message,
                // The browser's local time, sent as an absolute time.
                scheduled_at: later ? new Date(at).toISOString() : undefined,
            });
            toast(res.data.message);
            onSent();
        } catch (e) {
            setSendError(errorMessage(e));
        } finally {
            setSending(false);
        }
    }

    async function cancelSchedule() {
        if (!confirm('Cancel the scheduled e-mail?')) {
            return;
        }
        try {
            await api.delete(`/${type}/${id}/email-schedule`);
            toast('Scheduled e-mail cancelled.');
            reload();
        } catch (e) {
            setSendError(errorMessage(e));
        }
    }

    return (
        <Modal
            open
            size="lg"
            title="Send to Email"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={send} loading={sending} disabled={recipients.length === 0 || (later && !at)}>
                        {later ? 'Schedule' : 'Send'}
                    </Button>
                </>
            }
        >
            {error ? (
                <ErrorNote message={error} />
            ) : !preview ? (
                <Spinner />
            ) : (
                <div className="space-y-4">
                    <ErrorNote message={sendError} />
                    {preview.already_sent && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">This document was already sent; the "{preview.template.name}" template is used.</p>}
                    <Field label="Contacts">
                        <div className="space-y-1.5">
                            {preview.recipients.map((r) => (
                                <Checkbox key={r.email} label={`${r.name} <${r.email}>`} checked={selected.includes(r.email)} onChange={() => toggle(r.email)} />
                            ))}
                            {preview.recipients.length === 0 && <p className="text-[13px] text-gray-500">The customer has no contact with an e-mail. Add an address below.</p>}
                        </div>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Other e-mail addresses">
                            <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="a@x.com, b@y.com" />
                        </Field>
                        <Field label="CC">
                            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@x.com" />
                        </Field>
                    </div>
                    <Checkbox label="Attach PDF" checked={attach} onChange={setAttach} />
                    {preview.can_schedule && (
                        <div className="rounded-xl border border-slate-200 p-3">
                            {preview.schedule && (
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                                    <span>
                                        <CalendarClock className="mr-1 inline h-4 w-4" />
                                        Scheduled for <b>{formatDateTime(preview.schedule.scheduled_at)}</b> to {preview.schedule.recipients.join(', ')}
                                    </span>
                                    <span className="flex gap-3">
                                        <button
                                            type="button"
                                            className="font-semibold text-brand hover:underline"
                                            onClick={() => {
                                                setChosen(preview.schedule!.recipients);
                                                setCc(preview.schedule!.cc ?? '');
                                                setAttach(preview.schedule!.attach_pdf);
                                                setAt(toLocalInput(preview.schedule!.scheduled_at));
                                                setLater(true);
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button type="button" className="font-semibold text-red-600 hover:underline" onClick={cancelSchedule}>
                                            Cancel schedule
                                        </button>
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-4 text-[13.5px]">
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={!later} onChange={() => setLater(false)} className="accent-brand" /> Send now
                                </label>
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={later} onChange={() => setLater(true)} className="accent-brand" /> Schedule
                                </label>
                                {later && (
                                    <div className="w-56">
                                        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
                                    </div>
                                )}
                            </div>
                            {later && <p className="mt-2 text-xs text-slate-500">The e-mail is sent automatically at this time{preview.schedule ? ' and replaces the current schedule' : ''}.</p>}
                        </div>
                    )}
                    <div className="rounded-md border border-gray-200">
                        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-[13px]">
                            <span className="font-medium">
                                Template: {preview.template.name}
                                {preview.template.active === false && <span className="ml-2 text-xs text-gray-500">(turned off for automatic e-mails; it is sent when you press Send)</span>}
                            </span>
                            {!edit && (
                                <button type="button" onClick={() => setEdit({ subject: preview.template.subject ?? '', message: preview.template.message ?? '' })} className="text-xs text-blue-600 hover:underline">
                                    Edit this e-mail
                                </button>
                            )}
                        </div>
                        {edit ? (
                            <div className="space-y-2 p-3">
                                <Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
                                <Textarea rows={8} value={edit.message} onChange={(e) => setEdit({ ...edit, message: e.target.value })} className="font-mono text-xs" />
                                <p className="text-xs text-gray-500">Merge fields like {'{contact_firstname}'} are filled in for each contact.</p>
                            </div>
                        ) : (
                            <div className="px-3 py-2 text-[13px] text-gray-600">Subject: {preview.template.subject}</div>
                        )}
                    </div>
                    {preview.logs.length > 0 && (
                        <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Sent before</p>
                            <ul className="space-y-1 text-xs text-gray-600">
                                {preview.logs.map((l) => (
                                    <li key={l.id}>
                                        {formatDateTime(l.created_at)} · {l.to} · <span className={l.status === 'failed' ? 'text-red-600' : l.status === 'sent' ? 'text-green-700' : ''}>{l.status}</span>
                                        {l.error && <span className="text-red-600"> ({l.error})</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
