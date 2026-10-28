import { useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { AttachmentList } from '../comments/AttachmentList';
import { Button, Checkbox, Field, Input, Select, Spinner, Textarea } from '../ui';
import { useToast } from '../ui/Toast';
import type { Attachment, NoteItem, ReminderItem } from '../../types';

export type RecordType = 'lead' | 'customer' | 'contract' | 'ticket' | 'expense';

/** Perfex "Notes" tab on a lead / customer / contract / ticket. */
export function NotesPanel({ type, id, withContacted = false, onChange }: { type: RecordType; id: number; withContacted?: boolean; onChange?: () => void }) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: NoteItem[] }>(`/records/${type}/${id}/notes`);
    const [text, setText] = useState('');
    const [contacted, setContacted] = useState(false);
    const [contactedAt, setContactedAt] = useState('');
    const [saving, setSaving] = useState(false);

    async function add() {
        if (!text.trim()) {
            return;
        }
        setSaving(true);
        try {
            await api.post(`/records/${type}/${id}/notes`, { description: text, contacted_at: contacted ? contactedAt || new Date().toISOString() : null });
            setText('');
            setContacted(false);
            reload();
            onChange?.();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    async function remove(note: NoteItem) {
        if (!confirm('Delete this note?')) {
            return;
        }
        await api.delete(`/notes/${note.id}`);
        reload();
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add note…" />
                <div className="flex flex-wrap items-center gap-3">
                    {withContacted && (
                        <>
                            <label className="flex items-center gap-1.5 text-[13px]">
                                <input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} /> I got in touch with this lead
                            </label>
                            {contacted && <Input type="datetime-local" value={contactedAt} onChange={(e) => setContactedAt(e.target.value)} className="w-auto" />}
                        </>
                    )}
                    <Button size="sm" onClick={add} loading={saving} className="ml-auto">
                        Add Note
                    </Button>
                </div>
            </div>
            {!data ? (
                <Spinner />
            ) : (
                <ul className="divide-y divide-gray-100">
                    {data.data.map((note) => (
                        <li key={note.id} className="py-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-semibold text-gray-800">{note.author}</span>
                                <span title={formatDateTime(note.created_at)}>{timeAgo(note.created_at)}</span>
                                {note.contacted_at && <span className="rounded bg-green-50 px-1.5 text-green-700">Contacted {formatDateTime(note.contacted_at)}</span>}
                                {note.is_own && (
                                    <button type="button" onClick={() => remove(note)} className="ml-auto text-gray-400 hover:text-red-600" title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-gray-700">{note.description}</p>
                        </li>
                    ))}
                    {data.data.length === 0 && <li className="py-3 text-[13px] text-gray-500">No notes yet.</li>}
                </ul>
            )}
        </div>
    );
}

/** Perfex "Reminders" tab: set a reminder for yourself or a colleague. */
export function RemindersPanel({ type, id }: { type: RecordType; id: number }) {
    const toast = useToast();
    const staff = useStaff();
    const { data, reload } = useApi<{ data: ReminderItem[] }>(`/records/${type}/${id}/reminders`);
    const [form, setForm] = useState({ remind_at: '', user_id: '', description: '', notify_by_email: false });

    async function add() {
        try {
            await api.post(`/records/${type}/${id}/reminders`, { ...form, user_id: form.user_id ? Number(form.user_id) : null });
            setForm({ remind_at: '', user_id: '', description: '', notify_by_email: false });
            toast('Reminder set.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date to be notified">
                    <Input type="datetime-local" value={form.remind_at} onChange={(e) => setForm({ ...form, remind_at: e.target.value })} />
                </Field>
                <Field label="Set reminder to">
                    <Select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                        <option value="">Me</option>
                        {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.full_name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Description">
                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
            </div>
            <div className="flex flex-wrap items-center gap-4">
                <Checkbox label="Send also an email for this reminder" checked={form.notify_by_email} onChange={(v) => setForm({ ...form, notify_by_email: v })} />
                <Button size="sm" onClick={add} disabled={!form.remind_at}>
                    Set Reminder
                </Button>
            </div>
            <table className="table-perfex">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Date</th>
                        <th>Remind</th>
                        <th>Notified</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {(data?.data ?? []).map((r) => (
                        <tr key={r.id}>
                            <td>{r.description}</td>
                            <td>{formatDateTime(r.remind_at)}</td>
                            <td>{r.user}</td>
                            <td>{r.is_notified ? 'Yes' : 'No'}</td>
                            <td className="text-right">
                                <button type="button" onClick={() => api.delete(`/reminders/${r.id}`).then(reload)} className="text-xs text-red-600 hover:underline">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {data?.data.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center text-gray-500">
                                No reminders.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

/** Files on a record: upload and list (with delete for the uploader / editors). */
export function FilesPanel({ type, id, files, canUpload, onChange }: { type: RecordType; id: number; files: Attachment[]; canUpload: boolean; onChange: () => void }) {
    const toast = useToast();
    const [uploading, setUploading] = useState(false);

    async function upload(list: File[]) {
        if (!list.length) {
            return;
        }
        setUploading(true);
        const body = new FormData();
        list.forEach((f) => body.append('files[]', f));
        try {
            await api.post(`/records/${type}/${id}/files`, body);
            toast('Uploaded.');
            onChange();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="space-y-3">
            {canUpload && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50">
                    <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload files'}
                    <input type="file" multiple className="hidden" onChange={(e) => (upload(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
                </label>
            )}
            <AttachmentList
                files={files}
                canDelete={(f) => f.is_own || canUpload}
                onDelete={(f) => confirm(`Delete ${f.original_name}?`) && api.delete(`/files/${f.id}`).then(onChange)}
            />
            {files.length === 0 && <p className="text-[13px] text-gray-500">No files.</p>}
        </div>
    );
}
