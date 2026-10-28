import { useState } from 'react';
import { Download, PhoneCall, PhoneIncoming, PhoneOutgoing, Play } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { AudioPlayer, usePolling } from '../../components/chat/ChatShared';
import { Button, EmptyState, Field, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type Call = {
    id: number;
    direction: 'out' | 'in';
    outcome: string;
    called_at: string;
    duration_minutes: number | null;
    talk_seconds: number | null;
    source: string;
    has_recording: boolean;
    notes: string | null;
    user: string | null;
    can_edit: boolean;
};
type Meta = { phone: string | null; outcomes: Record<string, string>; labels: Record<string, string>; can_log: boolean; provider: string | null; my_number: string | null };

const OUTCOME_COLORS: Record<string, string> = {
    answered: 'bg-emerald-50 text-emerald-700',
    callback: 'bg-sky-50 text-sky-700',
    no_answer: 'bg-amber-50 text-amber-700',
    busy: 'bg-amber-50 text-amber-700',
    switched_off: 'bg-gray-100 text-gray-600',
    wrong_number: 'bg-red-50 text-red-600',
    calling: 'bg-violet-50 text-violet-700',
    missed: 'bg-red-50 text-red-600',
    failed: 'bg-red-50 text-red-600',
};

function talkTime(seconds: number): string {
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const recordingBlob = (leadId: number, callId: number) => api.get(`/leads/${leadId}/calls/${callId}/recording`, { responseType: 'blob' }).then((r) => r.data as Blob);

async function downloadRecording(leadId: number, callId: number) {
    const url = URL.createObjectURL(await recordingBlob(leadId, callId));
    const link = document.createElement('a');
    link.href = url;
    link.download = `call-${callId}.mp3`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "2026-10-28T14:05" for a datetime-local input, in the browser's time. */
function localNow(date = new Date()): string {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
}

const blank = () => ({ direction: 'out', outcome: 'answered', called_at: localNow(), duration_minutes: '', notes: '', follow_up_at: '' });

/**
 * Lead modal → Call: call the lead's number and log each call with its outcome, duration and
 * notes, plus an optional follow-up reminder. Without a calling provider "Call now" opens the
 * phone / dialer app; with Exotel (Setup → Calls) it rings the staff member's mobile, then the
 * lead, and the call is logged automatically with its recording.
 */
export default function LeadCalls({ leadId, onLogged }: { leadId: number; onLogged: () => void }) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: Call[]; meta: Meta }>(`/leads/${leadId}/calls`);
    const [form, setForm] = useState(blank);
    const [editing, setEditing] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [dialing, setDialing] = useState(false);
    const [playing, setPlaying] = useState<number[]>([]);
    // A call in progress is completed by Exotel's callback: check again until it is.
    usePolling(reload, 5000, Boolean(data?.data.some((c) => c.outcome === 'calling')));

    if (!data) {
        return <Spinner />;
    }
    const { meta } = data;
    const dial = (meta.phone ?? '').replace(/[^\d+]/g, '');
    const set = (key: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    function startNew() {
        setForm(blank());
        setEditing(null);
        setErrors({});
        setOpen(true);
    }

    function startEdit(c: Call) {
        setForm({ direction: c.direction, outcome: c.outcome, called_at: localNow(new Date(c.called_at)), duration_minutes: c.duration_minutes?.toString() ?? '', notes: c.notes ?? '', follow_up_at: '' });
        setEditing(c.id);
        setErrors({});
        setOpen(true);
    }

    async function dialThroughProvider() {
        setDialing(true);
        try {
            const r = await api.post<{ message: string }>(`/leads/${leadId}/calls/dial`);
            toast(r.data.message);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setDialing(false);
        }
    }

    async function save() {
        setSaving(true);
        setErrors({});
        const payload = {
            ...form,
            called_at: new Date(form.called_at).toISOString(),
            duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
            follow_up_at: form.follow_up_at ? new Date(form.follow_up_at).toISOString() : null,
        };
        try {
            if (editing) {
                await api.put(`/leads/${leadId}/calls/${editing}`, payload);
            } else {
                await api.post(`/leads/${leadId}/calls`, payload);
            }
            toast(editing ? 'Call updated.' : form.follow_up_at ? 'Call logged and follow-up reminder set.' : 'Call logged.');
            setOpen(false);
            reload();
            onLogged();
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
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                {dial ? (
                    <>
                        <span className="text-[13.5px] text-gray-600">
                            Phone: <span className="font-semibold text-gray-900">{meta.phone}</span>
                        </span>
                        {meta.provider ? (
                            meta.can_log && (
                                <>
                                    <Button onClick={dialThroughProvider} loading={dialing} disabled={!meta.my_number} className="!bg-emerald-600 hover:!bg-emerald-700">
                                        <PhoneCall className="h-4 w-4" /> Call now
                                    </Button>
                                    <span className="text-xs text-gray-500">{meta.my_number ? `Your phone (+${meta.my_number}) rings first, then the lead.` : 'Your mobile number is not set in Setup → Calls.'}</span>
                                </>
                            )
                        ) : (
                            // tel: opens the phone's dialer, or a calling app on a computer.
                            <a href={`tel:${dial}`} onClick={() => meta.can_log && startNew()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-[7px] text-[13.5px] font-semibold text-white hover:bg-emerald-700 hover:text-white">
                                <PhoneCall className="h-4 w-4" /> Call now
                            </a>
                        )}
                    </>
                ) : (
                    <span className="text-[13.5px] text-gray-500">This lead has no phone number. Add it with Edit to call from here.</span>
                )}
                {meta.can_log && !open && (
                    <Button variant="secondary" onClick={startNew} className="ml-auto">
                        Log a call
                    </Button>
                )}
            </div>

            {open && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h6 className="mb-3 text-[14px] font-semibold">{editing ? 'Edit call' : 'Log a call'}</h6>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Call type">
                            <Select value={form.direction} onChange={set('direction')}>
                                <option value="out">Outgoing (we called)</option>
                                <option value="in">Incoming (lead called)</option>
                            </Select>
                        </Field>
                        <Field label="Outcome" required error={errors.outcome}>
                            <Select value={form.outcome} onChange={set('outcome')}>
                                {Object.entries(editing ? meta.labels : meta.outcomes).map(([id, label]) => (
                                    <option key={id} value={id}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Date and time" required error={errors.called_at}>
                            <Input type="datetime-local" value={form.called_at} onChange={set('called_at')} max={localNow()} />
                        </Field>
                        <Field label="Duration (minutes)" error={errors.duration_minutes}>
                            <Input type="number" min={0} value={form.duration_minutes} onChange={set('duration_minutes')} />
                        </Field>
                        {!editing && (
                            <Field label="Follow-up reminder" hint="Optional: reminds you to call again." error={errors.follow_up_at} className="sm:col-span-2">
                                <Input type="datetime-local" value={form.follow_up_at} onChange={set('follow_up_at')} min={localNow()} />
                            </Field>
                        )}
                        <Field label="Notes" error={errors.notes} className="sm:col-span-3">
                            <Textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="What was discussed, next steps…" />
                        </Field>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={save} loading={saving}>
                            Save
                        </Button>
                    </div>
                </div>
            )}

            {data.data.length === 0 ? (
                <EmptyState title="No calls logged" text="Calls you log with this lead will show here." />
            ) : (
                <ul className="divide-y divide-gray-100">
                    {data.data.map((c) => (
                        <li key={c.id} className="flex gap-3 py-3 text-[13.5px]">
                            {c.direction === 'out' ? <PhoneOutgoing className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-label="Outgoing" /> : <PhoneIncoming className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-label="Incoming" />}
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded px-1.5 text-xs font-semibold ${OUTCOME_COLORS[c.outcome] ?? 'bg-gray-100 text-gray-600'}`}>{meta.labels[c.outcome] ?? c.outcome}</span>
                                    <span className="text-gray-700">{c.direction === 'out' ? 'Outgoing' : 'Incoming'}</span>
                                    {c.talk_seconds ? <span className="text-gray-500">· {talkTime(c.talk_seconds)}</span> : c.duration_minutes !== null && <span className="text-gray-500">· {c.duration_minutes} min</span>}
                                    {c.source !== 'manual' && <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600" title="Logged automatically by the calling provider">Auto</span>}
                                    <span className="text-xs text-gray-400">
                                        {formatDateTime(c.called_at)}
                                        {c.user && ` · ${c.user}`}
                                    </span>
                                    {c.can_edit && (
                                        <button type="button" onClick={() => startEdit(c)} className="ml-auto text-xs text-blue-600 hover:underline">
                                            Edit
                                        </button>
                                    )}
                                </div>
                                {c.notes && <p className="mt-1 whitespace-pre-wrap text-gray-700">{c.notes}</p>}
                                {c.has_recording && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                        {playing.includes(c.id) ? (
                                            <AudioPlayer load={() => recordingBlob(leadId, c.id)} />
                                        ) : (
                                            <button type="button" onClick={() => setPlaying((p) => [...p, c.id])} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                                <Play className="h-3.5 w-3.5" /> Play recording
                                            </button>
                                        )}
                                        <button type="button" onClick={() => downloadRecording(leadId, c.id).catch((e) => toast(errorMessage(e), 'error'))} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                            <Download className="h-3.5 w-3.5" /> Download
                                        </button>
                                    </div>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
