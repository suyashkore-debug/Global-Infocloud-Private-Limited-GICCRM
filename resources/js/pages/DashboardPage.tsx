import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CalendarClock, ChevronRight, Clock, FolderKanban, ListChecks, Megaphone, MessageCircle, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES, optionById } from '../lib/constants';
import { emit, TASKS_CHANGED, TIMERS_CHANGED, TODOS_CHANGED } from '../lib/events';
import { formatDate, formatDuration, isOverdue } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { money } from '../lib/sales';
import ColumnPairChart from '../components/charts/ColumnPairChart';
import BarList from '../components/charts/BarList';
import { useEvent } from '../hooks/useEvent';
import { Card, Spinner, StatusBadge } from '../components/ui';
import { useTaskModals } from '../components/tasks/TaskModalHost';
import { TodoModal, type TodoItem } from './todos/TodosPage';
import type { Task } from '../types';
import { Funnel, HotLeads, LeadsKpi, type LeadInsights } from './dashboard/LeadWidgets';

interface Dashboard {
    projects_by_status: Record<string, number>;
    my_tasks_open: number;
    my_tasks_overdue: number;
    my_tasks_due_today: number;
    logged_this_week_seconds: number;
    upcoming_tasks: Task[];
}

const greeting = () => {
    const h = new Date().getHours();

    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

interface Insights {
    week: { date: string; count: number }[];
    deadlines: { id: number; name: string; customer: string | null; deadline: string; days_left: number; progress: number }[];
    finance?: { months: string[]; income: number[]; expenses: number[]; outstanding: number; overdue: number; overdue_count: number };
    team_hours?: { name: string; seconds: number }[];
    leads?: LeadInsights;
    tickets?: { name: string; color: string | null; count: number; closed: boolean }[];
}

const rupees = (n: number) => money(n).replace(/\.00$/, '');

export default function DashboardPage() {
    const { user } = useAuth();
    const { openTask, newTask } = useTaskModals();
    const navigate = useNavigate();
    const { data, reload } = useApi<{ data: Dashboard }>('/dashboard');
    const insights = useApi<{ data: Insights }>('/dashboard/insights');
    useEvent([TASKS_CHANGED, TIMERS_CHANGED], () => (reload(), insights.reload()));
    const stats = data?.data;
    const more = insights.data?.data;
    const totalProjects = stats ? Object.values(stats.projects_by_status).reduce((a, b) => a + b, 0) : 0;

    return (
        <div className="w-full space-y-6">
            {/* Welcome banner with the user's week */}
            <div className="brand-banner relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2c56] via-[#123d73] to-[#1a4f8f] px-6 py-6 text-white shadow-lg shadow-brand/20 sm:px-8">
                <span className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[36px] border-white/5" />
                <span className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
                <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                        <p className="text-[13px] font-medium text-blue-100/70">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        <h1 className="mt-1 font-display text-[26px] font-extrabold leading-tight">
                            {greeting()}, {user?.first_name ?? user?.full_name} 👋
                        </h1>
                        <p className="mt-1 text-[14px] text-blue-100/80">
                            {stats ? (
                                stats.my_tasks_overdue > 0 ? (
                                    <>
                                        You have <b className="text-white">{stats.my_tasks_overdue} overdue</b> and <b className="text-white">{stats.my_tasks_due_today} due today</b>.
                                    </>
                                ) : stats.my_tasks_due_today > 0 ? (
                                    <>
                                        <b className="text-white">{stats.my_tasks_due_today}</b> of your tasks are due today.
                                    </>
                                ) : (
                                    'Nothing due today — a good day to get ahead.'
                                )
                            ) : (
                                user?.company?.company_name
                            )}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => newTask()} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13.5px] font-semibold text-white shadow-sm shadow-black/10 transition hover:brightness-110">
                                <Plus className="h-4 w-4" /> New task
                            </button>
                            <button type="button" onClick={() => navigate('/projects?new=1')} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-[13.5px] font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20">
                                <FolderKanban className="h-4 w-4" /> New project
                            </button>
                            <button type="button" onClick={() => navigate('/chat')} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-[13.5px] font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20">
                                <MessageCircle className="h-4 w-4" /> Chat
                            </button>
                        </div>
                    </div>
                    {more && <WeekStrip days={more.week} />}
                </div>
            </div>

            <Announcements />

            {!stats ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex h-[92px] items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-5">
                                <span className="skeleton h-12 w-12 shrink-0 rounded-2xl" />
                                <span className="flex-1 space-y-2.5">
                                    <span className="skeleton block h-2.5 w-2/3 rounded-full" />
                                    <span className="skeleton block h-5 w-1/3 rounded-full" />
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="grid gap-5 lg:grid-cols-3">
                        <span className="skeleton block h-56 rounded-2xl" />
                        <span className="skeleton block h-56 rounded-2xl" />
                        <span className="skeleton block h-56 rounded-2xl" />
                    </div>
                    <Card className="p-5">
                        <Spinner />
                    </Card>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                        <StatCard icon={ListChecks} label="My open tasks" value={stats.my_tasks_open} to="/tasks" />
                        <StatCard icon={CalendarClock} label="Due today" value={stats.my_tasks_due_today} to="/tasks" tone={stats.my_tasks_due_today > 0 ? 'warning' : undefined} />
                        <StatCard icon={AlertTriangle} label="Overdue" value={stats.my_tasks_overdue} to="/tasks" tone={stats.my_tasks_overdue > 0 ? 'critical' : undefined} />
                        <StatCard icon={Clock} label="Logged this week" value={`${formatDuration(stats.logged_this_week_seconds)} h`} to="/timesheets" />
                    </div>

                    {more?.leads && (
                        <div className="grid gap-5 lg:grid-cols-3">
                            <LeadsKpi leads={more.leads} />
                            <Funnel statuses={more.leads.statuses} />
                            <HotLeads rows={more.leads.hot} />
                        </div>
                    )}

                    {more?.finance && <BusinessPulse finance={more.finance} />}

                    <div className="grid gap-5 lg:grid-cols-3">
                        <Card className="p-5 lg:col-span-2">
                            <CardHead title="My tasks" link="/tasks" />
                            {stats.upcoming_tasks.length === 0 ? (
                                <div className="flex flex-col items-center py-8 text-center">
                                    <span className="text-3xl">🎉</span>
                                    <p className="mt-2 text-sm text-slate-500">No open tasks assigned to you.</p>
                                </div>
                            ) : (
                                <ul className="-mx-2 divide-y divide-slate-100">
                                    {stats.upcoming_tasks.map((task) => {
                                        const priority = optionById(TASK_PRIORITIES, task.priority);
                                        const late = isOverdue(task.due_date, task.status);

                                        return (
                                            <li key={task.id}>
                                                <button type="button" onClick={() => openTask(task.id)} className="flex w-full flex-wrap items-center gap-3 rounded-lg px-2 py-3 text-left transition hover:bg-slate-50">
                                                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: priority?.color }} title={`${priority?.name} priority`} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[14px] font-semibold text-slate-800">{task.name}</p>
                                                        <p className="truncate text-xs text-slate-500">
                                                            {task.project?.name ?? 'No project'} · {priority?.name} priority
                                                        </p>
                                                    </div>
                                                    <StatusBadge option={optionById(TASK_STATUSES, task.status)} />
                                                    <span className={`inline-flex w-28 items-center justify-end gap-1 text-xs ${late ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                                                        {late && <AlertTriangle className="h-3.5 w-3.5" />}
                                                        {task.due_date ? formatDate(task.due_date) : 'No due date'}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Card>
                        <Deadlines rows={more?.deadlines ?? []} />
                    </div>

                    {(more?.tickets || more?.team_hours) && (
                        <div className="grid gap-5 lg:grid-cols-2">
                            {more.tickets && (
                                <Card className="p-5">
                                    <CardHead title="Support" link="/tickets" />
                                    <p className="-mt-2 mb-4 text-xs text-slate-500">
                                        <b className="text-slate-700">{more.tickets.filter((t) => !t.closed).reduce((a, t) => a + t.count, 0)}</b> tickets not closed
                                    </p>
                                    <BarList rows={more.tickets.filter((t) => !t.closed).map((t) => ({ label: t.name, value: t.count, color: t.color }))} unit="tickets" />
                                </Card>
                            )}
                            {more.team_hours && (
                                <Card className="p-5">
                                    <CardHead title="Team hours this week" link="/reports/timesheets" />
                                    <p className="-mt-2 mb-4 text-xs text-slate-500">Logged on tasks since Monday, top {Math.max(1, more.team_hours.length)}</p>
                                    {more.team_hours.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No time logged yet this week.</p> : <BarList rows={more.team_hours.map((m) => ({ label: m.name, value: m.seconds }))} format={(v) => `${formatDuration(v)} h`} />}
                                </Card>
                            )}
                        </div>
                    )}

                    <div className="grid gap-5 lg:grid-cols-3">
                        <Card className="p-5">
                            <CardHead title="Projects" link="/projects" />
                            <p className="-mt-2 mb-4 text-xs text-slate-500">{totalProjects} projects you can see, by status</p>
                            <ul className="space-y-3.5">
                                {PROJECT_STATUSES.map((status) => {
                                    const count = stats.projects_by_status[status.id] ?? 0;
                                    const share = totalProjects ? (count / totalProjects) * 100 : 0;

                                    return (
                                        <li key={status.id} title={`${status.name}: ${count} of ${totalProjects} projects`}>
                                            <Link to="/projects" className="group block">
                                                <span className="mb-1.5 flex items-center justify-between text-[13px]">
                                                    <span className="flex items-center gap-2 text-slate-600 group-hover:text-slate-900">
                                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                                                        {status.name}
                                                    </span>
                                                    <span className="font-semibold text-slate-800">{count}</span>
                                                </span>
                                                <span className="block h-1.5 overflow-hidden rounded-full bg-brand-50">
                                                    <span className="block h-full rounded-full bg-brand transition-all group-hover:bg-brand-light" style={{ width: `${share}%` }} />
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>
                        <div className="lg:col-span-2">
                            <MyTodos />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/** The next seven days in the banner: how many of my open tasks fall due each day. */
function WeekStrip({ days }: { days: { date: string; count: number }[] }) {
    const navigate = useNavigate();

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-100/60">Your week</p>
            <div className="grid grid-cols-7 gap-1.5">
                {days.map((d, i) => {
                    const date = new Date(`${d.date}T00:00:00`);

                    return (
                        <button
                            key={d.date}
                            type="button"
                            onClick={() => navigate('/tasks')}
                            title={`${d.count} task${d.count === 1 ? '' : 's'} due ${i === 0 ? 'today (incl. overdue)' : date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}`}
                            className={`flex w-12 flex-col items-center rounded-xl py-2 transition sm:w-14 ${i === 0 ? 'bg-white text-brand shadow-md' : 'bg-white/[0.07] text-white ring-1 ring-white/10 hover:bg-white/[0.14]'}`}
                        >
                            <span className={`text-[10.5px] font-semibold uppercase ${i === 0 ? 'text-accent' : 'text-blue-100/60'}`}>{i === 0 ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                            <span className="text-[18px] font-bold leading-tight">{date.getDate()}</span>
                            <span className={`mt-1 h-5 min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${d.count ? (i === 0 ? 'bg-accent text-white' : 'bg-white/90 text-brand') : i === 0 ? 'text-slate-300' : 'text-blue-100/30'}`}>{d.count || '·'}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Money in and out over the last 12 months, with the headline numbers beside it. */
function BusinessPulse({ finance }: { finance: NonNullable<Insights['finance']> }) {
    const n = finance.income.length;
    const thisMonth = finance.income[n - 1] ?? 0;
    const lastMonth = finance.income[n - 2] ?? 0;
    const net = thisMonth - (finance.expenses[n - 1] ?? 0);
    const delta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

    return (
        <Card className="p-5">
            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
                <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-between">
                        <h2 className="text-[15px] font-semibold text-slate-800">Business pulse</h2>
                        <Link to="/reports/management" className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand hover:text-brand-light">
                            Management dashboard <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <p className="mb-4 text-xs text-slate-500">Payments received vs expenses, last 12 months</p>
                    <ColumnPairChart
                        categories={finance.months}
                        series={[
                            { key: 'income', label: 'Income', color: 'var(--viz-income)', values: finance.income },
                            { key: 'expenses', label: 'Expenses', color: 'var(--viz-expense)', values: finance.expenses },
                        ]}
                        format={rupees}
                    />
                </div>
                <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-xl bg-brand-50 p-4">
                        <p className="text-[12.5px] font-semibold text-slate-500">Income this month</p>
                        <p className="mt-0.5 font-display text-[26px] font-extrabold leading-tight text-slate-800">{rupees(thisMonth)}</p>
                        {delta !== null && (
                            <p className={`mt-1 inline-flex items-center gap-1 text-[12px] font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                {delta >= 0 ? '+' : ''}
                                {delta}% vs last month
                            </p>
                        )}
                    </div>
                    <MiniStat label="Net this month" value={rupees(net)} tone={net < 0 ? 'critical' : undefined} />
                    <MiniStat label="Outstanding invoices" value={rupees(finance.outstanding)} to="/invoices" />
                    <MiniStat label={`Overdue${finance.overdue_count ? ` · ${finance.overdue_count} invoice${finance.overdue_count === 1 ? '' : 's'}` : ''}`} value={rupees(finance.overdue)} tone={finance.overdue > 0 ? 'critical' : undefined} to="/invoices" />
                </div>
            </div>
        </Card>
    );
}

function MiniStat({ label, value, tone, to }: { label: string; value: string; tone?: 'critical'; to?: string }) {
    const body = (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 px-4 py-3 transition hover:bg-slate-50">
            <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
                    {tone === 'critical' && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
                    {label}
                </span>
                <span className={`block text-[17px] font-bold ${tone === 'critical' ? 'text-red-600' : 'text-slate-800'}`}>{value}</span>
            </span>
            {to && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
        </div>
    );

    return to ? <Link to={to}>{body}</Link> : body;
}

/** Projects due in the next 30 days (overdue ones included), soonest first. */
function Deadlines({ rows }: { rows: Insights['deadlines'] }) {
    return (
        <Card className="p-5">
            <CardHead title="Upcoming deadlines" link="/projects" />
            {rows.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                    <CalendarCheck className="h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No project deadlines in the next 30 days.</p>
                </div>
            ) : (
                <ul className="-mx-2 space-y-1">
                    {rows.map((p) => {
                        const late = p.days_left < 0;
                        const soon = p.days_left <= 7;

                        return (
                            <li key={p.id}>
                                <Link to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-50">
                                    <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none ${late ? 'bg-red-50 text-red-600' : soon ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand'}`}>
                                        <b className="text-[15px]">{Math.abs(p.days_left)}</b>
                                        <span className="mt-0.5 text-[9.5px] font-semibold uppercase">{late ? 'late' : p.days_left === 0 ? 'today' : 'days'}</span>
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13.5px] font-semibold text-slate-800">{p.name}</span>
                                        <span className="block truncate text-xs text-slate-500">
                                            {p.customer ?? 'No customer'} · due {formatDate(p.deadline)}
                                        </span>
                                        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                                            <span className="block h-full rounded-full bg-brand" style={{ width: `${p.progress}%` }} />
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

function CardHead({ title, link }: { title: string; link?: string }) {
    return (
        <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
            {link && (
                <Link to={link} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand hover:text-brand-light">
                    View all <ChevronRight className="h-4 w-4" />
                </Link>
            )}
        </div>
    );
}

/** Perfex dashboard announcements, until each staff member dismisses them. */
function Announcements() {
    const { data, reload } = useApi<{ data: { id: number; name: string; message: string; author: string | null; show_name: boolean; created_at: string }[] }>('/announcements', { active: 1 });

    return (
        <>
            {data?.data.map((a) => (
                <div key={a.id} className="rounded-xl border border-accent/20 bg-accent-50 p-4">
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-accent shadow-sm">
                            <Megaphone className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800">{a.name}</p>
                            <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-slate-600">{a.message}</p>
                            <p className="mt-1 text-xs text-slate-400">
                                {formatDate(a.created_at)}
                                {a.show_name && a.author && ` · ${a.author}`}
                            </p>
                        </div>
                        <button type="button" onClick={() => api.post(`/announcements/${a.id}/dismiss`).then(reload)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800">
                            Dismiss
                        </button>
                    </div>
                </div>
            ))}
        </>
    );
}

const TONES = {
    neutral: { icon: 'bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-light))] text-white shadow-[0_8px_16px_-8px_rgba(11,44,86,0.8)]', value: 'text-slate-800', disc: 'bg-brand' },
    warning: { icon: 'bg-[linear-gradient(135deg,#f59e0b,#d97706)] text-white shadow-[0_8px_16px_-8px_rgba(217,119,6,0.8)]', value: 'text-amber-700', disc: 'bg-amber-500' },
    critical: { icon: 'bg-[linear-gradient(135deg,#ef4444,#dc2626)] text-white shadow-[0_8px_16px_-8px_rgba(220,38,38,0.8)]', value: 'text-red-600', disc: 'bg-red-500' },
};

/** A stat tile: icon, value, label (status tones only for "due today" / "overdue"). */
function StatCard({ icon: Icon, label, value, to, tone }: { icon: typeof Clock; label: string; value: number | string; to?: string; tone?: 'warning' | 'critical' }) {
    const t = TONES[tone ?? 'neutral'];
    const body = (
        <Card className="group relative flex flex-col gap-3 overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <span className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.06] ${t.disc}`} />
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${t.icon}`}>
                <Icon className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-500">{label}</p>
                <p className={`font-display text-[26px] font-extrabold leading-tight ${t.value}`}>{value}</p>
            </div>
            {to && <ChevronRight className="ml-auto hidden h-5 w-5 text-slate-300 transition group-hover:text-brand sm:block" />}
        </Card>
    );

    return to ? <Link to={to}>{body}</Link> : body;
}

/** Perfex dashboard "My To Do Items": the latest unfinished and finished items. */
function MyTodos() {
    const open = useApi<{ data: TodoItem[] }>('/todos', { finished: 0 });
    const done = useApi<{ data: TodoItem[] }>('/todos', { finished: 1 });
    const [adding, setAdding] = useState(false);
    const reload = () => {
        open.reload();
        done.reload();
        emit(TODOS_CHANGED);
    };
    useEvent([TODOS_CHANGED], () => {
        open.reload();
        done.reload();
    });

    async function toggle(todo: TodoItem) {
        await api.patch(`/todos/${todo.id}`, { finished: !todo.finished });
        reload();
    }

    const list = (items: TodoItem[] | undefined, empty: string) => (
        <ul className="space-y-1.5">
            {(items ?? []).slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={t.finished} onChange={() => toggle(t)} className="mt-0.5 h-4 w-4 accent-brand" />
                    <span className={t.finished ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.description}</span>
                </li>
            ))}
            {items?.length === 0 && <li className="px-2 text-sm text-slate-400">{empty}</li>}
        </ul>
    );

    return (
        <Card className="p-5 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-slate-800">My To Do Items</h2>
                <div className="flex gap-3 text-[13px] font-semibold">
                    <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-brand hover:text-brand-light">
                        <Plus className="h-4 w-4" /> New To Do
                    </button>
                    <Link to="/todos" className="inline-flex items-center gap-0.5 text-brand hover:text-brand-light">
                        View all <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
                <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-accent">Latest to do's</p>
                    {list(open.data?.data, 'No unfinished todos found')}
                </div>
                <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-600">Latest finished to do's</p>
                    {list(done.data?.data, 'No finished todos found')}
                </div>
            </div>
            {adding && (
                <TodoModal
                    todo={null}
                    onClose={() => setAdding(false)}
                    onSaved={() => {
                        setAdding(false);
                        reload();
                    }}
                />
            )}
        </Card>
    );
}
