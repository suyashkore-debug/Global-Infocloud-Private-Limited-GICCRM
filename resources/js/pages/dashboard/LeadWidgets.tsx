import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Flame, Phone, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { timeAgo } from '../../lib/format';
import { money } from '../../lib/sales';
import { Card } from '../../components/ui';
import { RatingStars } from '../crm/LeadRating';

export interface HotLead {
    id: number;
    name: string;
    company: string | null;
    phone: string | null;
    rating: number;
    last_contact_at: string | null;
    status: { name: string; color: string } | null;
}

export interface LeadInsights {
    statuses: { name: string; color: string | null; count: number; value: number }[];
    new_this_month: number;
    new_last_month: number;
    converted_this_month: number;
    daily: number[];
    hot: HotLead[];
}

const rupees = (n: number) => money(n).replace(/\.00$/, '');

function Head({ title, icon, link = '/leads', linkLabel = 'View all' }: { title: string; icon?: ReactNode; link?: string; linkLabel?: string }) {
    return (
        <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
                {icon}
                {title}
            </h2>
            <Link to={link} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand hover:text-brand-light">
                {linkLabel} <ChevronRight className="h-4 w-4" />
            </Link>
        </div>
    );
}

/** New leads this month against the same days last month, with a 14-day trend line. */
export function LeadsKpi({ leads }: { leads: LeadInsights }) {
    const delta = leads.new_last_month > 0 ? Math.round(((leads.new_this_month - leads.new_last_month) / leads.new_last_month) * 100) : null;
    const open = leads.statuses.reduce((a, s) => a + s.count, 0);
    const value = leads.statuses.reduce((a, s) => a + s.value, 0);

    return (
        <Link
            to="/leads"
            className="brand-banner group relative block overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#0b2c56,#164479_60%,#1a4f8f)] p-5 text-white shadow-[0_18px_40px_-18px_rgba(11,44,86,0.75)] transition hover:-translate-y-0.5"
        >
            <span className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-accent/25 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
                <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-blue-100/70">New leads this month</p>
                    <p className="mt-1 font-display text-[40px] font-extrabold leading-none">{leads.new_this_month}</p>
                    {delta !== null ? (
                        <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${delta >= 0 ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'}`}>
                            {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {delta >= 0 ? '+' : ''}
                            {delta}% vs last month
                        </p>
                    ) : (
                        <p className="mt-2 text-[12px] text-blue-100/60">{leads.new_last_month} by this date last month</p>
                    )}
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <Target className="h-5 w-5 text-accent" />
                </span>
            </div>
            <Sparkline values={leads.daily} />
            <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
                <KpiBit label="Open" value={open} />
                <KpiBit label="Converted" value={leads.converted_this_month} />
                <KpiBit label="Pipeline" value={rupees(value)} />
            </div>
        </Link>
    );
}

function KpiBit({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{value}</p>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-blue-100/55">{label}</p>
        </div>
    );
}

/** A small area chart of the last 14 days (oldest on the left). */
function Sparkline({ values }: { values: number[] }) {
    const w = 280;
    const h = 56;
    const max = Math.max(1, ...values);
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const points = values.map((v, i) => [i * step, h - 4 - (v / max) * (h - 10)] as const);
    const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = points[points.length - 1];

    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="relative mt-4 h-14 w-full" role="img" aria-label={`New leads per day, last 14 days: ${values.join(', ')}`}>
            <defs>
                <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#fa6010" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#fa6010" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#spark-fill)" />
            <path d={line} fill="none" stroke="#ff9a52" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {last && <circle cx={last[0]} cy={last[1]} r="3.5" fill="#fff" stroke="#fa6010" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        </svg>
    );
}

/** The lead pipeline as a funnel: one centred bar per status, its width by the number of leads. */
export function Funnel({ statuses }: { statuses: LeadInsights['statuses'] }) {
    const max = Math.max(1, ...statuses.map((s) => s.count));

    return (
        <Card className="p-5">
            <Head title="Sales funnel" />
            {statuses.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No lead statuses yet.</p>
            ) : (
                <ul className="space-y-1.5">
                    {statuses.map((s) => {
                        const width = s.count ? Math.max(22, (s.count / max) * 100) : 14;
                        const color = s.color ?? '#0b2c56';

                        return (
                            <li key={s.name} title={`${s.name}: ${s.count} lead${s.count === 1 ? '' : 's'}${s.value ? ` · ${rupees(s.value)}` : ''}`}>
                                <Link to="/leads" className="group grid grid-cols-[1fr_auto] items-center gap-3">
                                    <span className="flex justify-center">
                                        <span
                                            className="flex h-8 items-center justify-center rounded-lg px-2 text-[12px] font-bold transition-all duration-500 group-hover:brightness-110"
                                            style={{ width: `${width}%`, background: s.count ? `linear-gradient(90deg, ${color}, ${color}cc)` : 'var(--color-slate-200)', color: s.count ? '#fff' : 'var(--color-slate-400)' }}
                                        >
                                            {s.count}
                                        </span>
                                    </span>
                                    <span className="w-28 truncate text-[12.5px] font-medium text-slate-600 group-hover:text-slate-900">{s.name}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

/** 4-5 star leads not yet converted, the longest without contact first, with a call button. */
export function HotLeads({ rows }: { rows: HotLead[] }) {
    return (
        <Card className="p-5">
            <Head title="Hot leads · call today" icon={<Flame className="h-[18px] w-[18px] text-accent" />} linkLabel="All" />
            {rows.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent">
                        <Flame className="h-6 w-6" />
                    </span>
                    <p className="mt-2 text-sm font-semibold text-slate-700">No hot leads yet</p>
                    <p className="mt-0.5 max-w-[15rem] text-xs text-slate-500">Rate your leads with 4 or 5 stars and they show up here.</p>
                </div>
            ) : (
                <ul className="-mx-2 space-y-1">
                    {rows.map((l) => (
                        <li key={l.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent-50/60">
                            <Link to={`/leads?lead=${l.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#ff8a3d,#fa6010)] text-[13px] font-bold text-white">
                                    {l.name.slice(0, 2).toUpperCase()}
                                    {l.rating === 5 && <span className="absolute -right-1.5 -top-1.5 text-[13px]">🔥</span>}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-[13.5px] font-semibold text-slate-800">{l.name}</span>
                                    <span className="flex items-center gap-2 text-[11.5px]">
                                        <RatingStars rating={l.rating} size="sm" />
                                        <span className={l.last_contact_at ? 'text-slate-500' : 'font-semibold text-red-600'}>{l.last_contact_at ? timeAgo(l.last_contact_at) : 'Never contacted'}</span>
                                    </span>
                                </span>
                            </Link>
                            {l.phone && (
                                <a
                                    href={`tel:${l.phone}`}
                                    title={`Call ${l.phone}`}
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition hover:bg-emerald-500 hover:text-white"
                                >
                                    <Phone className="h-4 w-4" />
                                </a>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
