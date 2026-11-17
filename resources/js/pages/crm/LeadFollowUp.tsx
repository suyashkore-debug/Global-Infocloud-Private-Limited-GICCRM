import { useState } from 'react';
import { AlarmClock, CalendarCheck2, CalendarClock, Check, Pencil, X } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { appLocale, appTimeZone } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { Button, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Lead } from '../../types';

type Tone = 'overdue' | 'today' | 'tomorrow' | 'later';

/** Calendar day of a moment in the company's timezone, as YYYY-MM-DD. */
const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: appTimeZone() }).format(d);

function toneOf(at: Date, now = new Date()): Tone {
    if (at.getTime() < now.getTime()) {
        return 'overdue';
    }
    const today = dayOf(now);
    const tomorrow = dayOf(new Date(now.getTime() + 86400000));
    const day = dayOf(at);

    return day === today ? 'today' : day === tomorrow ? 'tomorrow' : 'later';
}

const TONES: Record<Tone, { cls: string; label: string }> = {
    overdue: { cls: 'bg-red-50 text-red-700 ring-red-200', label: 'Overdue' },
    today: { cls: 'bg-orange-50 text-orange-700 ring-orange-200', label: 'Today' },
    tomorrow: { cls: 'bg-blue-50 text-blue-700 ring-blue-200', label: 'Tomorrow' },
    later: { cls: 'bg-slate-100 text-slate-700 ring-slate-200', label: '' },
};

const time = (d: Date) => new Intl.DateTimeFormat(appLocale(), { hour: 'numeric', minute: '2-digit', timeZone: appTimeZone() }).format(d);
const dayMonth = (d: Date) => new Intl.DateTimeFormat(appLocale(), { day: 'numeric', month: 'short', timeZone: appTimeZone() }).format(d);

/** How long ago a missed follow-up was due: "3h", "2d". */
function late(at: Date): string {
    const minutes = Math.max(1, Math.round((Date.now() - at.getTime()) / 60000));
    return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
}

/** A follow-up as a coloured chip: red when missed, orange today, blue tomorrow, grey later. */
export function FollowUpChip({ at, compact = false }: { at: string | null | undefined; compact?: boolean }) {
    if (!at) {
        return null;
    }
    const d = new Date(at);
    const tone = toneOf(d);
    const text = tone === 'overdue' ? `Overdue ${late(d)}` : tone === 'later' ? `${dayMonth(d)}, ${time(d)}` : `${TONES[tone].label} ${time(d)}`;

    return (
        <span title={`Next follow-up: ${dayMonth(d)}, ${time(d)}`} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${TONES[tone].cls}`}>
            {tone === 'overdue' ? <AlarmClock className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
            {compact && tone === 'overdue' ? 'Overdue' : text}
        </span>
    );
}

export type FollowUpFilter = 'overdue' | 'today' | 'next_7_days';

/**
 * Above the leads list: follow-ups due for the leads you can see. A chip filters the list to them
 * (and sorts by follow-up time); clicking it again clears that filter.
 */
export function FollowUpBar({ active, onPick, refreshKey }: { active: FollowUpFilter | null; onPick: (f: FollowUpFilter | null) => void; refreshKey?: unknown }) {
    const { data } = useApi<{ data: { overdue: number; today: number; next_7_days: number; mine_overdue: number } }>('/leads/follow-ups', { k: refreshKey as string | undefined });
    const counts = data?.data;
    const chips: { id: FollowUpFilter; label: string; count: number; cls: string; on: string }[] = [
        { id: 'overdue', label: 'Overdue', count: counts?.overdue ?? 0, cls: 'bg-white text-red-700 ring-red-200 hover:bg-red-50', on: 'bg-red-600 text-white ring-red-600 hover:bg-red-700' },
        { id: 'today', label: 'Today', count: counts?.today ?? 0, cls: 'bg-white text-orange-700 ring-orange-200 hover:bg-orange-50', on: 'bg-orange-500 text-white ring-orange-500 hover:bg-orange-600' },
        { id: 'next_7_days', label: 'Next 7 days', count: counts?.next_7_days ?? 0, cls: 'bg-white text-blue-700 ring-blue-200 hover:bg-blue-50', on: 'bg-blue-600 text-white ring-blue-600 hover:bg-blue-700' },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
                <CalendarCheck2 className="h-4 w-4 text-accent" /> Follow-ups
            </span>
            {chips.map((c) => (
                <button
                    key={c.id}
                    type="button"
                    aria-pressed={active === c.id}
                    onClick={() => onPick(active === c.id ? null : c.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 ${active === c.id ? c.on : c.cls}`}
                >
                    {c.label}
                    <span className={`rounded-full px-1.5 text-[11px] ${active === c.id ? 'bg-white/25' : 'bg-slate-100 text-slate-600'}`}>{c.count}</span>
                </button>
            ))}
            {active && (
                <button type="button" onClick={() => onPick(null)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-800">
                    <X className="h-3.5 w-3.5" /> Clear
                </button>
            )}
        </div>
    );
}

/** "2026-11-17T16:30" for a datetime-local input, in this browser's clock. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Quick choices: in an hour, tomorrow 10 AM, in 3 days 10 AM, next week 10 AM. */
function presets(): { label: string; at: Date }[] {
    const at10 = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        d.setHours(10, 0, 0, 0);
        return d;
    };
    return [
        { label: 'In 1 hour', at: new Date(Date.now() + 3600000) },
        { label: 'Tomorrow 10 AM', at: at10(1) },
        { label: 'In 3 days', at: at10(3) },
        { label: 'Next week', at: at10(7) },
    ];
}

/**
 * The lead's next follow-up in its window: when, what about, and buttons to set or move it, or
 * mark it done (which counts as contact and can set the next one at once).
 */
export function FollowUpPanel({ lead, canEdit, onChanged }: { lead: Lead; canEdit: boolean; onChanged: (lead: Lead) => void }) {
    const toast = useToast();
    const [mode, setMode] = useState<'view' | 'edit' | 'done'>('view');
    const [at, setAt] = useState('');
    const [note, setNote] = useState('');
    const [outcome, setOutcome] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const open = (next: 'edit' | 'done') => {
        setAt(next === 'edit' && lead.next_follow_up_at ? localInput(new Date(lead.next_follow_up_at)) : '');
        setNote(next === 'edit' ? (lead.follow_up_note ?? '') : '');
        setOutcome('');
        setError(null);
        setMode(next);
    };

    async function save(payload: Record<string, unknown>, message: string) {
        setSaving(true);
        setError(null);
        try {
            const { data } = await api.post<{ data: Lead }>(`/leads/${lead.id}/follow-up`, payload);
            onChanged(data.data);
            setMode('view');
            toast(message);
        } catch (e) {
            const fields = fieldErrors(e);
            setError(Object.values(fields)[0] ?? errorMessage(e));
        } finally {
            setSaving(false);
        }
    }
    const nextAt = () => (at ? new Date(at).toISOString() : null);

    if (mode === 'view') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200/70">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600">
                    <CalendarCheck2 className="h-4 w-4 text-accent" /> Next follow-up
                </span>
                {lead.next_follow_up_at ? (
                    <>
                        <FollowUpChip at={lead.next_follow_up_at} />
                        {lead.follow_up_note && <span className="min-w-0 truncate text-[12.5px] text-slate-600">{lead.follow_up_note}</span>}
                    </>
                ) : (
                    <span className="text-[12.5px] text-slate-400">Not set</span>
                )}
                {canEdit && (
                    <span className="ml-auto flex items-center gap-1.5">
                        {lead.next_follow_up_at && (
                            <Button size="sm" variant="secondary" onClick={() => open('done')}>
                                <Check className="h-3.5 w-3.5" /> Done
                            </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => open('edit')}>
                            <Pencil className="h-3.5 w-3.5" /> {lead.next_follow_up_at ? 'Change' : 'Set follow-up'}
                        </Button>
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-inset ring-accent/30">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                <CalendarCheck2 className="h-4 w-4 text-accent" /> {mode === 'done' ? 'Follow-up done' : 'Next follow-up'}
            </p>
            {mode === 'done' && (
                <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What happened? (optional, saved on the Activity Log)" maxLength={500} />
            )}
            <div className="space-y-2">
                {mode === 'done' && <p className="text-[12px] font-semibold text-slate-500">Next follow-up (optional)</p>}
                <div className="flex flex-wrap gap-1.5">
                    {presets().map((p) => (
                        <button key={p.label} type="button" onClick={() => setAt(localInput(p.at))} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-200">
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
                    <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Follow-up date and time" />
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="About what? e.g. Send the quotation" maxLength={500} />
                </div>
            </div>
            {error && <p className="text-[12.5px] text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {mode === 'edit' && lead.next_follow_up_at ? (
                    <button type="button" disabled={saving} onClick={() => save({ next_follow_up_at: null }, 'Follow-up removed.')} className="text-[12.5px] font-semibold text-slate-500 hover:text-red-600">
                        Remove follow-up
                    </button>
                ) : (
                    <span />
                )}
                <span className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setMode('view')} disabled={saving}>
                        Cancel
                    </Button>
                    {mode === 'done' ? (
                        <Button size="sm" loading={saving} onClick={() => save({ done: true, outcome: outcome || null, next_follow_up_at: nextAt(), follow_up_note: note || null }, at ? 'Done. Next follow-up set.' : 'Follow-up done.')}>
                            <Check className="h-3.5 w-3.5" /> Mark done
                        </Button>
                    ) : (
                        <Button size="sm" loading={saving} disabled={!at} onClick={() => save({ next_follow_up_at: nextAt(), follow_up_note: note || null }, 'Follow-up set.')}>
                            Save
                        </Button>
                    )}
                </span>
            </div>
        </div>
    );
}
