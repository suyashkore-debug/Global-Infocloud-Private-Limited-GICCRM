import { Activity, ArrowRight, ArrowRightLeft, Ban, FileText, Mail, MessageCircle, Paperclip, Pencil, Phone, PhoneIncoming, RotateCcw, Sparkles, Star, StickyNote, Trophy, UserCheck, type LucideIcon } from 'lucide-react';
import { formatDate, formatDateTime } from '../../lib/format';
import type { Lead } from '../../types';

type Item = NonNullable<Lead['activities']>[number];

/** How each kind of lead activity looks: matched on the logged description. */
const KINDS: { test: RegExp; icon: LucideIcon; tone: string; label: string }[] = [
    { test: /^Created lead/i, icon: Sparkles, tone: 'bg-emerald-500', label: 'Created' },
    { test: /^Status changed/i, icon: ArrowRightLeft, tone: 'bg-brand', label: 'Status' },
    { test: /^Assigned to/i, icon: UserCheck, tone: 'bg-violet-500', label: 'Assigned' },
    { test: /^Converted to customer/i, icon: Trophy, tone: 'bg-emerald-600', label: 'Won' },
    { test: /^Marked as/i, icon: Ban, tone: 'bg-red-500', label: 'Flagged' },
    { test: /^Unmarked as/i, icon: RotateCcw, tone: 'bg-slate-500', label: 'Restored' },
    { test: /^Rating changed/i, icon: Star, tone: 'bg-amber-500', label: 'Rating' },
    { test: /^Incoming call/i, icon: PhoneIncoming, tone: 'bg-sky-500', label: 'Call' },
    { test: /call/i, icon: Phone, tone: 'bg-sky-500', label: 'Call' },
    { test: /whatsapp/i, icon: MessageCircle, tone: 'bg-green-500', label: 'WhatsApp' },
    { test: /^Emailed|e-?mail/i, icon: Mail, tone: 'bg-blue-500', label: 'Email' },
    { test: /proposal/i, icon: FileText, tone: 'bg-indigo-500', label: 'Proposal' },
    { test: /note/i, icon: StickyNote, tone: 'bg-amber-400', label: 'Note' },
    { test: /attachment|upload/i, icon: Paperclip, tone: 'bg-slate-500', label: 'File' },
    { test: /^Updated lead/i, icon: Pencil, tone: 'bg-slate-400', label: 'Edited' },
];
const OTHER = { icon: Activity, tone: 'bg-slate-400', label: 'Activity' };

const kindOf = (a: Item) => KINDS.find((k) => k.test.test(a.description)) ?? OTHER;

/** "Today", "Yesterday" or the date, for the day headings. */
function dayLabel(iso: string): string {
    const day = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();

    return same(day, today) ? 'Today' : same(day, yesterday) ? 'Yesterday' : formatDate(iso);
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** The description, with a status change shown as "old → new" chips. */
function Description({ text }: { text: string }) {
    const status = text.match(/^Status changed from (.+) to (.+)$/i);
    if (status) {
        return (
            <span className="flex flex-wrap items-center gap-1.5">
                Status changed
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-semibold text-slate-500 line-through decoration-slate-300">{status[1]}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[12px] font-semibold text-brand">{status[2]}</span>
            </span>
        );
    }
    const rating = text.match(/^Rating changed to (\d)\/5$/i);
    if (rating) {
        const n = Number(rating[1]);
        return (
            <span className="flex flex-wrap items-center gap-1.5">
                Rating changed to
                <span className="text-amber-400" aria-label={`${n} of 5`}>
                    {'★'.repeat(n)}
                    <span className="text-slate-300">{'★'.repeat(5 - n)}</span>
                </span>
            </span>
        );
    }

    return <span>{text}</span>;
}

/**
 * The lead's history as a vertical timeline, newest first, grouped by day: an icon per kind of
 * event (call, WhatsApp, e-mail, proposal, status…), who did it and when.
 */
export default function LeadTimeline({ activities }: { activities: Item[] }) {
    if (activities.length === 0) {
        return <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>;
    }

    const days: { label: string; items: Item[] }[] = [];
    for (const a of activities) {
        const label = dayLabel(a.created_at);
        const last = days[days.length - 1];
        if (last?.label === label) {
            last.items.push(a);
        } else {
            days.push({ label, items: [a] });
        }
    }

    return (
        <div className="space-y-5">
            {days.map((day) => (
                <section key={day.label}>
                    <p className="mb-3 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{day.label}</p>
                    <ol className="relative ml-[17px] space-y-3 border-l-2 border-slate-100 pl-6">
                        {day.items.map((a) => {
                            const kind = kindOf(a);
                            const Icon = kind.icon;

                            return (
                                <li key={a.id} className="relative">
                                    <span className={`absolute -left-[43px] top-0.5 flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-[0_6px_14px_-6px_rgba(16,24,40,0.5)] ring-4 ring-white ${kind.tone}`}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="rounded-xl border border-slate-200/70 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-slate-300 hover:shadow-md">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{kind.label}</span>
                                            <span className="text-[11.5px] text-slate-400" title={formatDateTime(a.created_at)}>
                                                {time(a.created_at)}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-[13.5px] text-slate-700">
                                            <Description text={a.description} />
                                        </div>
                                        <p className="mt-1 text-[12px] text-slate-500">
                                            by <span className="font-semibold text-slate-600">{a.user ?? 'System'}</span>
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            ))}
        </div>
    );
}
