import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlarmClock, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarCheck2, Handshake, IndianRupee, Minus, PhoneCall, Sparkles, Target, Trophy, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { money } from '../../lib/sales';
import { Avatar, ErrorNote, Spinner } from '../../components/ui';
import ColumnPairChart from '../../components/charts/ColumnPairChart';
import BarList from '../../components/charts/BarList';
import { FollowUpChip } from './LeadFollowUp';

type Period = 'today' | '7d' | '30d' | 'this_month' | 'this_year';

const PERIODS: { id: Period; label: string; previous: string }[] = [
    { id: 'today', label: 'Today', previous: 'yesterday' },
    { id: '7d', label: '7 days', previous: 'the 7 days before' },
    { id: '30d', label: '30 days', previous: 'the 30 days before' },
    { id: 'this_month', label: 'This month', previous: 'the same days last month' },
    { id: 'this_year', label: 'This year', previous: 'the same days last year' },
];

/** The two series of the trend chart: categorical slots 1 and 2 (validated pair). */
const SERIES = { new: '#2a78d6', converted: '#eb6834' };

interface Dashboard {
    workspace?: string | null;
    period: { key: Period; from: string; to: string };
    kpis: { new: number; new_prev: number; converted: number; converted_prev: number; contacted: number; open: number; open_value: number; overdue: number; due_today: number };
    trend: { labels: string[]; new: number[]; converted: number[] };
    sources: { source: string; leads: number; converted: number }[];
    pipeline: { id: number; name: string; color: string; count: number; value: number }[];
    follow_ups: { id: number; name: string; company: string | null; phone: string | null; assigned: string | null; at: string; note: string | null }[];
    team: { id: number; name: string; photo_url: string | null; open: number; assigned: number; contacted: number; converted: number; overdue: number; calls: number }[];
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Change against the period before: an arrow, the % and words, so it never rests on colour alone. */
function Delta({ now, before, previous }: { now: number; before: number; previous: string }) {
    if (before === 0 && now === 0) {
        return <span className="text-[12px] text-slate-400">No change vs {previous}</span>;
    }
    if (before === 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">
                <ArrowUpRight className="h-3.5 w-3.5" /> New vs {previous}
            </span>
        );
    }
    const change = Math.round(((now - before) / before) * 100);
    const up = change > 0;
    const Icon = change === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;

    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${change === 0 ? 'bg-slate-100 text-slate-600' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`} title={`${before} in ${previous}`}>
            <Icon className="h-3.5 w-3.5" /> {change > 0 ? '+' : ''}
            {change}% vs {previous}
        </span>
    );
}

function Kpi({ icon: Icon, tone, label, value, foot, to }: { icon: typeof Target; tone: string; label: string; value: ReactNode; foot: ReactNode; to?: string }) {
    const body = (
        <>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <p className="mt-2 font-display text-[30px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">{value}</p>
            <div className="mt-2.5 min-h-[22px]">{foot}</div>
        </>
    );
    const cls = 'block rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-slate-200/70 transition';

    return to ? (
        <Link to={to} className={`${cls} hover:-translate-y-0.5 hover:shadow-md hover:ring-brand/30`}>
            {body}
        </Link>
    ) : (
        <div className={cls}>{body}</div>
    );
}

function Panel({ title, hint, action, children, className = '' }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-slate-200/70 ${className}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-[15px] font-bold text-slate-800">{title}</h3>
                    {hint && <p className="text-[12.5px] text-slate-500">{hint}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

/**
 * Leads → Dashboard: the period's new, converted and contacted leads against the period before,
 * the daily trend, where leads come from, the pipeline now, follow-ups due and the team's numbers.
 */
export default function LeadsDashboardPage() {
    const navigate = useNavigate();
    const [period, setPeriod] = useState<Period>('30d');
    const { data, error, loading } = useApi<{ data: Dashboard }>('/leads/dashboard', { period });
    const d = data?.data;
    const meta = PERIODS.find((p) => p.id === period)!;
    const k = d?.kpis;
    const short = (n: number) => money(n);

    return (
        <div className="w-full space-y-5">
            {/* Header with the period switch */}
            <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0b2c56_0%,#123f75_55%,#1a4f8f_100%)] px-6 py-6 text-white shadow-[0_20px_50px_-25px_rgba(11,44,86,0.6)]">
                <span className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#2a78d6]/30 blur-3xl" />
                <span className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-[#fa6010]/20 blur-3xl" />
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <button type="button" onClick={() => navigate('/leads')} className="mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-100/80 hover:text-white">
                            <ArrowLeft className="h-3.5 w-3.5" /> Leads
                        </button>
                        <h4 className="flex items-center gap-2 font-display text-[26px] font-extrabold tracking-tight">
                            <Sparkles className="h-6 w-6 text-[#ffb48a]" /> Leads Dashboard
                        </h4>
                        <p className="mt-1 text-[13.5px] text-blue-100/80">How your leads are doing{d?.workspace ? ` in the ${d.workspace} workspace` : ''}{d ? ` · ${d.period.from === d.period.to ? d.period.from : `${d.period.from} → ${d.period.to}`}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 rounded-2xl bg-white/10 p-1 ring-1 ring-white/15 backdrop-blur" role="group" aria-label="Period">
                        {PERIODS.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                aria-pressed={period === p.id}
                                onClick={() => setPeriod(p.id)}
                                className={`rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition ${period === p.id ? 'bg-white text-[#0b2c56] shadow-sm' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <ErrorNote message={error} />
            {!d || !k ? (
                loading ? <Spinner /> : null
            ) : (
                <>
                    {/* The headline numbers */}
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                        <Kpi icon={Target} tone="bg-blue-50 text-blue-600" label="New leads" value={k.new} foot={<Delta now={k.new} before={k.new_prev} previous={meta.previous} />} to="/leads" />
                        <Kpi
                            icon={Handshake}
                            tone="bg-emerald-50 text-emerald-600"
                            label="Converted"
                            value={k.converted}
                            foot={
                                <span className="text-[12px] text-slate-500">
                                    <b className="text-slate-700">{pct(k.converted, k.new)}%</b> of new leads · <Delta now={k.converted} before={k.converted_prev} previous={meta.previous} />
                                </span>
                            }
                        />
                        <Kpi icon={PhoneCall} tone="bg-violet-50 text-violet-600" label="Contacted" value={k.contacted} foot={<span className="text-[12px] text-slate-500">Leads with a contact in the period</span>} />
                        <Kpi
                            icon={IndianRupee}
                            tone="bg-amber-50 text-amber-600"
                            label="Open pipeline"
                            value={<span className="text-[24px]">{short(k.open_value)}</span>}
                            foot={<span className="text-[12px] text-slate-500"><b className="text-slate-700">{k.open}</b> open leads (not lost, junk or converted)</span>}
                            to="/leads"
                        />
                        <Kpi
                            icon={AlarmClock}
                            tone={k.overdue > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}
                            label="Follow-ups"
                            value={
                                <span className={k.overdue > 0 ? 'text-red-600' : ''}>
                                    {k.overdue}
                                    <span className="ml-1.5 text-[14px] font-semibold text-slate-500">overdue</span>
                                </span>
                            }
                            foot={
                                <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                                    <CalendarCheck2 className="h-3.5 w-3.5 text-orange-500" /> <b className="text-slate-700">{k.due_today}</b> more due today
                                </span>
                            }
                            to="/leads"
                        />
                    </div>

                    {/* Trend and sources */}
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                        <Panel title="New and converted leads" hint={period === 'this_year' ? 'Per month' : 'Per day'}>
                            {k.new === 0 && k.converted === 0 ? (
                                <p className="py-16 text-center text-[13px] text-slate-400">No new or converted leads in this period.</p>
                            ) : (
                                <ColumnPairChart
                                    categories={d.trend.labels}
                                    series={[
                                        { key: 'new', label: 'New leads', color: SERIES.new, values: d.trend.new },
                                        { key: 'converted', label: 'Converted', color: SERIES.converted, values: d.trend.converted },
                                    ]}
                                    format={(n) => String(n)}
                                    integer
                                    height={260}
                                />
                            )}
                        </Panel>
                        <Panel title="Where leads come from" hint="New leads by source · converted in brackets">
                            <BarList rows={d.sources.map((s) => ({ label: s.source, value: s.leads, hint: s.converted ? `(${s.converted} converted · ${pct(s.converted, s.leads)}%)` : undefined }))} />
                        </Panel>
                    </div>

                    {/* Pipeline and follow-ups */}
                    <div className="grid gap-4 xl:grid-cols-2">
                        <Panel title="Pipeline now" hint="Open leads by status, with their value" action={<Link to="/leads" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:text-accent">Open kanban <ArrowRight className="h-3.5 w-3.5" /></Link>}>
                            <BarList rows={d.pipeline.map((s) => ({ label: s.name, value: s.count, color: s.color, hint: s.value ? short(s.value) : undefined }))} />
                        </Panel>
                        <Panel title="Follow-ups due" hint="Overdue and today, soonest first" action={<span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${k.overdue ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{k.overdue ? `${k.overdue} overdue` : 'All on time'}</span>}>
                            {d.follow_ups.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-10 text-center">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                                        <CalendarCheck2 className="h-6 w-6" />
                                    </span>
                                    <p className="text-[13.5px] font-semibold text-slate-700">Nothing due</p>
                                    <p className="text-[12.5px] text-slate-500">No overdue follow-ups and none left for today.</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {d.follow_ups.map((f) => (
                                        <li key={f.id}>
                                            <Link to={`/leads?lead=${f.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50/70">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13.5px] font-semibold text-slate-800">{f.name}</p>
                                                    <p className="truncate text-[12px] text-slate-500">{[f.note, f.company, f.assigned].filter(Boolean).join(' · ')}</p>
                                                </div>
                                                <FollowUpChip at={f.at} />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    </div>

                    {/* Team */}
                    <Panel title="Team" hint={`${meta.label}: leads assigned, contacted and converted; open leads and overdue follow-ups right now`} action={<Trophy className="h-5 w-5 text-amber-500" />}>
                        {d.team.length === 0 ? (
                            <p className="py-8 text-center text-[13px] text-slate-400">No staff have leads yet.</p>
                        ) : (
                            <div className="table-scroll -mx-5 overflow-x-auto">
                                <table className="table-perfex" data-nosort>
                                    <thead>
                                        <tr>
                                            <th className="pl-5">Staff</th>
                                            <th className="text-right">Open leads</th>
                                            <th className="text-right">Assigned</th>
                                            <th className="text-right">Contacted</th>
                                            <th className="text-right">Calls</th>
                                            <th className="text-right">Converted</th>
                                            <th className="text-right">Conversion</th>
                                            <th className="pr-5 text-right">Overdue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.team.map((t, i) => (
                                            <tr key={t.id}>
                                                <td className="pl-5">
                                                    <span className="flex items-center gap-2.5">
                                                        <span className="w-4 text-[12px] font-bold text-slate-400">{i + 1}</span>
                                                        <Avatar id={t.id} name={t.name} photo={t.photo_url} size="sm" />
                                                        <span className="font-semibold text-slate-800">{t.name}</span>
                                                        {i === 0 && t.converted > 0 && <Trophy className="h-4 w-4 text-amber-500" aria-label="Top converter" />}
                                                    </span>
                                                </td>
                                                <td className="text-right tabular-nums">{t.open}</td>
                                                <td className="text-right tabular-nums">{t.assigned}</td>
                                                <td className="text-right tabular-nums">{t.contacted}</td>
                                                <td className="text-right tabular-nums">{t.calls}</td>
                                                <td className="text-right font-semibold tabular-nums text-slate-800">{t.converted}</td>
                                                <td className="text-right">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                                                            <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct(t.converted, Math.max(t.assigned, t.converted))}%` }} />
                                                        </span>
                                                        <span className="tabular-nums">{pct(t.converted, Math.max(t.assigned, t.converted))}%</span>
                                                    </span>
                                                </td>
                                                <td className="pr-5 text-right">
                                                    {t.overdue > 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-bold text-red-700">
                                                            <AlarmClock className="h-3.5 w-3.5" /> {t.overdue}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[12px] text-slate-400">0</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>
                    <p className="flex items-center gap-1.5 text-[12px] text-slate-400">
                        <Users className="h-3.5 w-3.5" /> Counts include only the leads you can see.
                    </p>
                </>
            )}
        </div>
    );
}
