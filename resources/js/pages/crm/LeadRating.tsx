import { useState } from 'react';
import { CheckCircle2, Circle, Star } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import type { Lead } from '../../types';

/** Qualification criteria, in star order (Lead::QUALIFICATION): n met = n stars. */
export const QUALIFICATION = [
    { key: 'industry', label: 'Right industry' },
    { key: 'company_size', label: 'Suitable company size' },
    { key: 'business_need', label: 'Clear business need' },
    { key: 'decision_maker', label: 'Decision-maker access' },
    { key: 'timeline', label: 'Timeline & intent' },
];

const LEVELS = [
    { label: 'Not rated', className: 'bg-slate-100 text-slate-500', bar: 'bg-slate-300' },
    { label: 'Cold', className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', bar: 'bg-sky-400' },
    { label: 'Cool', className: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200', bar: 'bg-cyan-500' },
    { label: 'Warm', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', bar: 'bg-amber-400' },
    { label: 'Hot', className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200', bar: 'bg-orange-500' },
    { label: 'Priority / SQL ready', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', bar: 'bg-emerald-500' },
];

export function ratingLevel(rating: number) {
    return LEVELS[Math.max(0, Math.min(5, rating))];
}

/** Saves the criteria the lead meets and returns the updated lead. */
export async function saveQualification(lead: Lead, criteria: string[]): Promise<Lead> {
    const { data } = await api.post<{ data: Lead }>(`/leads/${lead.id}/qualification`, { criteria });
    return data.data;
}

/**
 * Five stars. Clickable when onRate is given: clicking star n rates n (the first n criteria);
 * clicking the current rating again clears it.
 */
export function RatingStars({ rating, onRate, size = 'md' }: { rating: number; onRate?: (rating: number) => void; size?: 'sm' | 'md' }) {
    const [hover, setHover] = useState<number | null>(null);
    const shown = hover ?? rating;
    const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]';

    return (
        <span className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(null)} title={`${rating}/5 · ${ratingLevel(rating).label}`}>
            {[1, 2, 3, 4, 5].map((n) => {
                const star = <Star className={`${icon} ${n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'}`} />;
                return onRate ? (
                    <button
                        key={n}
                        type="button"
                        className="rounded p-px transition hover:scale-110"
                        onMouseEnter={() => setHover(n)}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRate(n === rating ? 0 : n);
                        }}
                        aria-label={`Rate ${n} of 5`}
                    >
                        {star}
                    </button>
                ) : (
                    <span key={n}>{star}</span>
                );
            })}
        </span>
    );
}

/** Stars for a lead in a table row, saving straight away. */
export function LeadRatingCell({ lead, onChanged }: { lead: Lead; onChanged: (lead: Lead) => void }) {
    const toast = useToast();

    async function rate(n: number) {
        try {
            onChanged(await saveQualification(lead, QUALIFICATION.slice(0, n).map((c) => c.key)));
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return <RatingStars rating={lead.rating} onRate={lead.can.update ? rate : undefined} size="sm" />;
}

/** Profile card: score, stars, level and the criteria checklist. */
export function QualificationCard({ lead, onChanged }: { lead: Lead; onChanged: (lead: Lead) => void }) {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const editable = lead.can.update && !saving;
    const level = ratingLevel(lead.rating);

    async function save(criteria: string[]) {
        setSaving(true);
        try {
            onChanged(await saveQualification(lead, criteria));
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    const toggle = (key: string) => save(lead.qualification.includes(key) ? lead.qualification.filter((k) => k !== key) : [...lead.qualification, key]);

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="grid sm:grid-cols-[220px_1fr]">
                <div className="flex flex-col items-start gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:border-b-0 sm:border-r">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Qualification score</p>
                    <p className="flex items-baseline gap-1 leading-none">
                        <span className="font-display text-[32px] font-extrabold text-slate-800">{lead.rating}</span>
                        <span className="text-[15px] font-semibold text-slate-400">/ 5</span>
                    </p>
                    <RatingStars rating={lead.rating} onRate={editable ? (n) => save(QUALIFICATION.slice(0, n).map((c) => c.key)) : undefined} />
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${level.className}`}>{level.label}</span>
                </div>
                <div className="flex flex-col justify-center gap-3 px-5 py-4">
                    <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-semibold text-slate-700">Criteria met</span>
                        <span className="text-slate-500">
                            {lead.rating} of {QUALIFICATION.length}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full transition-all duration-300 ${level.bar}`} style={{ width: `${lead.rating * 20}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {QUALIFICATION.map((c) => {
                            const met = lead.qualification.includes(c.key);
                            return (
                                <button
                                    key={c.key}
                                    type="button"
                                    disabled={!editable}
                                    onClick={() => toggle(c.key)}
                                    title={editable ? (met ? 'Click to untick' : 'Click to tick') : undefined}
                                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition disabled:cursor-default ${
                                        met
                                            ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800'
                                            : 'border-dashed border-slate-300 bg-white text-slate-500 enabled:hover:border-solid enabled:hover:border-slate-400 enabled:hover:text-slate-700'
                                    }`}
                                >
                                    {met ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                                    {c.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
