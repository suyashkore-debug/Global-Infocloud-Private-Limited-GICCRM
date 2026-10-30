import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, FileSignature, FolderKanban, ListChecks, Receipt, Target } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { ACTIVITY_LABELS, PROJECT_STATUSES, optionById } from '../../lib/constants';
import { ESTIMATE_STATUSES, INVOICE_STATUSES, PROPOSAL_STATUSES, money } from '../../lib/sales';
import { formatDate, formatDateTime, timeAgo, toIsoDate } from '../../lib/format';
import ColumnPairChart from '../../components/charts/ColumnPairChart';
import BarList from '../../components/charts/BarList';
import { Card, Select, StatusBadge, Tabs } from '../../components/ui';

type Ratio = { count: number; total: number };

export interface Widgets {
    quick_stats: {
        invoices_awaiting?: Ratio;
        leads_converted?: Ratio;
        projects_in_progress: Ratio;
        tasks_not_finished: Ratio;
    };
    finance_overview?: Partial<
        Record<
            'invoices' | 'estimates' | 'proposals',
            {
                total: number;
                not_sent?: number;
                statuses: { id: number; count: number; amount: number }[];
            }
        >
    >;
    my_projects: {
        id: number;
        name: string;
        customer: string | null;
        start_date: string | null;
        deadline: string | null;
        status: number;
        progress: number;
    }[];
    my_reminders: {
        id: number;
        description: string | null;
        remind_at: string;
        related: string;
        link: string | null;
    }[];
    tickets?: {
        id: number;
        subject: string;
        status: { name: string; color: string | null } | null;
        priority: string | null;
        last_reply_at: string | null;
        created_at: string;
    }[];
    tickets_by_department?: { name: string; count: number }[];
    contracts_expiring?: {
        id: number;
        subject: string;
        customer: string | null;
        start_date: string | null;
        end_date: string;
    }[];
    upcoming_events: Record<
        'this_week' | 'next_week',
        {
            id: number;
            title: string;
            start: string;
            color: string | null;
            public: boolean;
            added_by: string | null;
        }[]
    >;
    project_activity: {
        id: number;
        project: { id: number; name: string } | null;
        user: string | null;
        description_key: string;
        additional_data: string | null;
        created_at: string;
    }[];
    latest_activity?: {
        id: number;
        description: string;
        user: string | null;
        created_at: string;
    }[];
    can_tickets_report: boolean;
    can_payments: boolean;
}

export function WidgetHead({ title, link, linkLabel = 'View all', children }: { title: string; link?: string; linkLabel?: string; children?: ReactNode }) {
    return (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
            <div className="flex items-center gap-3">
                {children}
                {link && (
                    <Link to={link} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand hover:text-brand-light">
                        {linkLabel} <ChevronRight className="h-4 w-4" />
                    </Link>
                )}
            </div>
        </div>
    );
}

const Empty = ({ text }: { text: string }) => <p className="py-6 text-center text-sm text-slate-400">{text}</p>;

/** Perfex "Quick Stats": x of y with a progress bar for each. */
export function QuickStats({ stats }: { stats: Widgets['quick_stats'] }) {
    const tiles: {
        key: keyof Widgets['quick_stats'];
        label: string;
        icon: typeof Receipt;
        to: string;
        color: string;
    }[] = [
        {
            key: 'invoices_awaiting',
            label: 'Invoices awaiting payment',
            icon: Receipt,
            to: '/invoices',
            color: '#dc2626',
        },
        {
            key: 'leads_converted',
            label: 'Converted leads',
            icon: Target,
            to: '/leads',
            color: '#16a34a',
        },
        {
            key: 'projects_in_progress',
            label: 'Projects in progress',
            icon: FolderKanban,
            to: '/projects',
            color: '#2563eb',
        },
        {
            key: 'tasks_not_finished',
            label: 'Tasks not finished',
            icon: ListChecks,
            to: '/tasks',
            color: '#ea580c',
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles
                .filter((t) => stats[t.key])
                .map(({ key, label, icon: Icon, to, color }) => {
                    const { count, total } = stats[key]!;
                    const share = total ? Math.round((count / total) * 100) : 0;

                    return (
                        <Link key={key} to={to}>
                            <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                                        <Icon className="h-4 w-4" style={{ color }} />
                                        {label}
                                    </span>
                                    <span className="text-[13px] font-bold text-slate-800">
                                        {count} / {total}
                                    </span>
                                </div>
                                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <span
                                        className="block h-full rounded-full transition-all"
                                        style={{
                                            width: `${share}%`,
                                            backgroundColor: color,
                                        }}
                                    />
                                </span>
                                <p className="mt-1.5 text-right text-[11.5px] font-semibold text-slate-400">{share}%</p>
                            </Card>
                        </Link>
                    );
                })}
        </div>
    );
}

/** Perfex "Finance Overview": invoices, estimates and proposals by status, as a share of all. */
export function FinanceOverview({ finance }: { finance: NonNullable<Widgets['finance_overview']> }) {
    const columns = [
        {
            key: 'invoices' as const,
            title: 'Invoice overview',
            to: '/invoices',
            statuses: INVOICE_STATUSES,
        },
        {
            key: 'estimates' as const,
            title: 'Estimate overview',
            to: '/estimates',
            statuses: ESTIMATE_STATUSES,
        },
        {
            key: 'proposals' as const,
            title: 'Proposal overview',
            to: '/proposals',
            statuses: PROPOSAL_STATUSES,
        },
    ].filter((c) => finance[c.key]);

    return (
        <Card className="p-5">
            <WidgetHead title="Finance overview" />
            <div className={`grid gap-6 ${columns.length > 1 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
                {columns.map((c) => {
                    const data = finance[c.key]!;
                    const byId = new Map(data.statuses.map((s) => [s.id, s]));
                    const rows = c.statuses.map((s) => ({
                        ...s,
                        count: byId.get(s.id)?.count ?? 0,
                    }));
                    if (c.key === 'invoices' && data.not_sent !== undefined) {
                        rows.splice(0, 0, {
                            id: 0,
                            name: 'Not sent',
                            color: '#64748b',
                            count: data.not_sent,
                        });
                    }

                    return (
                        <div key={c.key}>
                            <Link to={c.to} className="mb-3 flex items-center justify-between text-[12px] font-bold uppercase tracking-wider text-slate-500 hover:text-brand">
                                {c.title} <span className="normal-case tracking-normal text-slate-400">{data.total} total</span>
                            </Link>
                            <ul className="space-y-2.5">
                                {rows.map((s) => {
                                    const share = data.total ? Math.round((s.count / data.total) * 100) : 0;

                                    return (
                                        <li key={s.id}>
                                            <span className="mb-1 flex items-center justify-between text-[13px]">
                                                <span className="font-medium" style={{ color: s.color }}>
                                                    {s.count} {s.name}
                                                </span>
                                                <span className="text-[12px] font-semibold text-slate-400">{share}%</span>
                                            </span>
                                            <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                                                <span
                                                    className="block h-full rounded-full"
                                                    style={{
                                                        width: `${share}%`,
                                                        backgroundColor: s.color,
                                                    }}
                                                />
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

type UserTab = 'tasks' | 'projects' | 'reminders' | 'tickets' | 'activity';

/** Perfex user widget: My Tasks, My Projects, My Reminders, Tickets and (admins) Latest Activity. */
export function UserWidget({ data, tasks }: { data: Widgets; tasks: ReactNode }) {
    const [tab, setTab] = useState<UserTab>('tasks');
    const tabs: { id: UserTab; label: string; count?: number }[] = [
        { id: 'tasks', label: 'My tasks' },
        {
            id: 'projects',
            label: 'My projects',
            count: data.my_projects.length,
        },
        {
            id: 'reminders',
            label: 'My reminders',
            count: data.my_reminders.length,
        },
        ...(data.tickets
            ? [
                  {
                      id: 'tickets' as const,
                      label: 'Tickets',
                      count: data.tickets.length,
                  },
              ]
            : []),
        ...(data.latest_activity ? [{ id: 'activity' as const, label: 'Latest activity' }] : []),
    ];
    const links: Record<UserTab, string> = {
        tasks: '/tasks',
        projects: '/projects',
        reminders: '/utilities/calendar',
        tickets: '/tickets',
        activity: '/utilities/activity-log',
    };

    return (
        <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Tabs tabs={tabs} active={tab} onChange={setTab} />
                <Link to={links[tab]} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand hover:text-brand-light">
                    View all <ChevronRight className="h-4 w-4" />
                </Link>
            </div>
            {tab === 'tasks' && tasks}
            {tab === 'projects' &&
                (data.my_projects.length === 0 ? (
                    <Empty text="You are not a member of any active project." />
                ) : (
                    <ul className="-mx-2 divide-y divide-slate-100">
                        {data.my_projects.map((p) => (
                            <li key={p.id}>
                                <Link to={`/projects/${p.id}`} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[14px] font-semibold text-slate-800">{p.name}</span>
                                        <span className="block truncate text-xs text-slate-500">
                                            {p.customer ?? 'No customer'} · {p.start_date ? formatDate(p.start_date) : '—'} → {p.deadline ? formatDate(p.deadline) : 'no deadline'}
                                        </span>
                                    </span>
                                    <StatusBadge option={optionById(PROJECT_STATUSES, p.status)} />
                                    <span className="w-16 text-right text-xs font-semibold text-slate-500">{p.progress}%</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ))}
            {tab === 'reminders' &&
                (data.my_reminders.length === 0 ? (
                    <Empty text="No upcoming reminders." />
                ) : (
                    <ul className="-mx-2 divide-y divide-slate-100">
                        {data.my_reminders.map((r) => {
                            const body = (
                                <span className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13.5px] text-slate-700">{r.description || 'Reminder'}</span>
                                        <span className="block text-xs text-slate-500">
                                            {r.related} · {formatDateTime(r.remind_at)}
                                        </span>
                                    </span>
                                </span>
                            );

                            return <li key={r.id}>{r.link ? <Link to={r.link}>{body}</Link> : body}</li>;
                        })}
                    </ul>
                ))}
            {tab === 'tickets' &&
                (!data.tickets?.length ? (
                    <Empty text="No open tickets." />
                ) : (
                    <ul className="-mx-2 divide-y divide-slate-100">
                        {data.tickets.map((t) => (
                            <li key={t.id}>
                                <Link to={`/tickets/${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13.5px] font-semibold text-slate-800">
                                            #{t.id} {t.subject}
                                        </span>
                                        <span className="block text-xs text-slate-500">
                                            {t.priority ?? '—'} priority · {t.last_reply_at ? `last reply ${timeAgo(t.last_reply_at)}` : `opened ${timeAgo(t.created_at)}`}
                                        </span>
                                    </span>
                                    {t.status && (
                                        <span
                                            className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                                            style={{
                                                color: t.status.color ?? '#475569',
                                                backgroundColor: `${t.status.color ?? '#475569'}1a`,
                                            }}
                                        >
                                            {t.status.name}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                ))}
            {tab === 'activity' && (
                <ul className="-mx-2 max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                    {data.latest_activity?.map((a) => (
                        <li key={a.id} className="px-2 py-2.5">
                            <p className="text-[13.5px] text-slate-700">
                                <b className="font-semibold text-slate-800">{a.user ?? 'System'}</b> — {a.description}
                            </p>
                            <p className="text-xs text-slate-400" title={formatDateTime(a.created_at)}>
                                {timeAgo(a.created_at)}
                            </p>
                        </li>
                    ))}
                    {data.latest_activity?.length === 0 && <Empty text="No activity yet." />}
                </ul>
            )}
        </Card>
    );
}

/** Contracts ending within the "contract expiration" days set in Setup. */
export function ContractsExpiring({ rows }: { rows: NonNullable<Widgets['contracts_expiring']> }) {
    return (
        <Card className="p-5">
            <WidgetHead title="Contracts expiring soon" link="/contracts" />
            {rows.length === 0 ? (
                <Empty text="No contracts expiring soon." />
            ) : (
                <ul className="-mx-2 space-y-1">
                    {rows.map((c) => (
                        <li key={c.id}>
                            <Link to={`/contracts/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                                <FileSignature className="h-4 w-4 shrink-0 text-amber-600" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-semibold text-slate-800">{c.subject}</span>
                                    <span className="block truncate text-xs text-slate-500">{c.customer ?? '—'}</span>
                                </span>
                                <span className="text-xs font-semibold text-amber-700">ends {formatDate(c.end_date)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

/** Calendar events of this week and next week. */
export function UpcomingEvents({ events }: { events: Widgets['upcoming_events'] }) {
    const group = (title: string, rows: Widgets['upcoming_events']['this_week']) => (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
            {rows.length === 0 ? (
                <p className="mb-3 px-2 text-sm text-slate-400">No events.</p>
            ) : (
                <ul className="mb-3 space-y-1.5">
                    {rows.map((e) => (
                        <li key={e.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <span
                                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                    backgroundColor: e.color || '#28B8DA',
                                }}
                            />
                            <span className="min-w-0">
                                <span className="block truncate text-[13.5px] font-semibold text-slate-800">{e.title}</span>
                                <span className="block text-xs text-slate-500">
                                    {formatDateTime(e.start)}
                                    {e.public ? ' · public' : ''}
                                    {e.added_by ? ` · ${e.added_by}` : ''}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    return (
        <Card className="p-5">
            <WidgetHead title="Upcoming events" link="/utilities/calendar" linkLabel="Calendar" />
            {group('This week', events.this_week)}
            {group('Next week', events.next_week)}
        </Card>
    );
}

/** The latest activity of the projects the user can see. */
export function ProjectActivity({ rows }: { rows: Widgets['project_activity'] }) {
    return (
        <Card className="p-5">
            <WidgetHead title="Project activity" link="/projects" />
            {rows.length === 0 ? (
                <Empty text="No project activity yet." />
            ) : (
                <ol className="relative ml-1 max-h-[420px] space-y-4 overflow-y-auto border-l border-slate-200 pl-5">
                    {rows.map((a) => (
                        <li key={a.id} className="relative">
                            <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-white" />
                            <p className="text-[13.5px] text-slate-700">
                                <b className="font-semibold text-slate-800">{a.user ?? 'System'}</b> {ACTIVITY_LABELS[a.description_key] ?? a.description_key}
                                {a.additional_data && <span className="text-slate-500"> — {a.additional_data}</span>}
                            </p>
                            <p className="text-xs text-slate-400">
                                {a.project && (
                                    <Link to={`/projects/${a.project.id}`} className="font-semibold text-brand hover:underline">
                                        {a.project.name}
                                    </Link>
                                )}{' '}
                                · <span title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</span>
                            </p>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}

/** Tickets waiting for the team (not answered or closed), per department. */
export function TicketsByDepartment({ rows }: { rows: NonNullable<Widgets['tickets_by_department']> }) {
    const total = rows.reduce((a, r) => a + r.count, 0);

    return (
        <Card className="p-5">
            <WidgetHead title="Tickets awaiting reply by department" link="/tickets" />
            <p className="-mt-2 mb-4 text-xs text-slate-500">
                <b className="text-slate-700">{total}</b> tickets awaiting reply
            </p>
            {rows.length === 0 ? <Empty text="Every ticket has been answered." /> : <BarList rows={rows.map((r) => ({ label: r.name, value: r.count }))} unit="tickets" />}
        </Card>
    );
}

const PERIODS = [
    { value: 'this_week', label: 'This week' },
    { value: 'last_week', label: 'Last week' },
    { value: 'this_month', label: 'This month' },
    { value: 'last_month', label: 'Last month' },
    { value: 'this_year', label: 'This year' },
    { value: 'last_year', label: 'Last year' },
];

const minutes = (m: number | null) => (m === null ? '—' : m < 60 ? `${m} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);

/** Admins: tickets assigned and replies written per staff member in a period. */
export function TicketsReport() {
    const [period, setPeriod] = useState('this_month');
    const { data } = useApi<{
        data: {
            rows: {
                user_id: number;
                name: string;
                total_assigned: number;
                open: number;
                closed: number;
                replies: number;
                average_reply_minutes: number | null;
            }[];
        };
    }>('/dashboard/tickets-report', { period });
    const rows = data?.data.rows;

    return (
        <Card className="p-5">
            <WidgetHead title="Tickets report by staff">
                <div className="w-36">
                    <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                        {PERIODS.map((p) => (
                            <option key={p.value} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </Select>
                </div>
            </WidgetHead>
            {!rows ? (
                <span className="skeleton block h-32 rounded-xl" />
            ) : rows.length === 0 ? (
                <Empty text="No tickets assigned in this period." />
            ) : (
                <div className="-mx-5 overflow-x-auto">
                    <table className="table-perfex w-full text-[13px]">
                        <thead>
                            <tr>
                                <th>Staff</th>
                                <th className="text-right">Assigned</th>
                                <th className="text-right">Open</th>
                                <th className="text-right">Closed</th>
                                <th className="text-right">Replies</th>
                                <th className="text-right">Avg. first reply</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.user_id}>
                                    <td className="font-semibold text-slate-800">{r.name}</td>
                                    <td className="text-right">{r.total_assigned}</td>
                                    <td className="text-right">{r.open}</td>
                                    <td className="text-right">{r.closed}</td>
                                    <td className="text-right">{r.replies}</td>
                                    <td className="text-right" data-sort-value={r.average_reply_minutes ?? -1}>
                                        {minutes(r.average_reply_minutes)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/** Perfex "Payment Records": this week vs last week by day, or this year by month. */
export function PaymentRecords() {
    const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
    const { data } = useApi<{
        data: {
            labels: string[];
            series: { label: string; values: number[] }[];
        };
    }>('/dashboard/payments', { period });
    const chart = data?.data;
    const colors = ['var(--viz-income)', '#94a3b8'];

    return (
        <Card className="p-5">
            <WidgetHead title="Payment records" link="/payments">
                <Tabs
                    tabs={[
                        { id: 'weekly', label: 'Weekly' },
                        { id: 'monthly', label: 'Monthly' },
                    ]}
                    active={period}
                    onChange={setPeriod}
                />
            </WidgetHead>
            {!chart ? (
                <span className="skeleton block h-56 rounded-xl" />
            ) : (
                <ColumnPairChart
                    categories={chart.labels}
                    series={chart.series.map((s, i) => ({
                        key: s.label,
                        label: s.label,
                        color: colors[i] ?? '#64748b',
                        values: s.values,
                    }))}
                    format={(n) => money(n).replace(/\.00$/, '')}
                />
            )}
        </Card>
    );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A month of the calendar on the dashboard; a day opens the full calendar. */
export function CalendarWidget() {
    const navigate = useNavigate();
    const [month, setMonth] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const days = useMemo(() => {
        const first = new Date(month);
        first.setDate(1 - first.getDay());
        return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
    }, [month]);
    const { data } = useApi<{
        data: { id: string; title: string; start: string; color: string }[];
    }>('/calendar', { start: toIsoDate(days[0]), end: toIsoDate(days[41]) });
    const byDay = useMemo(() => {
        const map = new Map<string, { id: string; title: string; color: string }[]>();
        for (const item of data?.data ?? []) {
            const key = item.start.slice(0, 10);
            map.set(key, [...(map.get(key) ?? []), item]);
        }
        return map;
    }, [data]);
    const today = toIsoDate(new Date());
    const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

    return (
        <Card className="p-5">
            <WidgetHead title="Calendar" link="/utilities/calendar" linkLabel="Open calendar">
                <span className="flex items-center gap-1">
                    <button type="button" onClick={() => shift(-1)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Previous month">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="w-28 text-center text-[13px] font-semibold text-slate-700">
                        {month.toLocaleDateString('en-IN', {
                            month: 'long',
                            year: 'numeric',
                        })}
                    </span>
                    <button type="button" onClick={() => shift(1)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Next month">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </span>
            </WidgetHead>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-[12px]">
                {WEEKDAYS.map((d) => (
                    <div key={d} className="bg-slate-50 py-1.5 text-center font-semibold text-slate-500">
                        {d}
                    </div>
                ))}
                {days.map((d) => {
                    const key = toIsoDate(d);
                    const items = byDay.get(key) ?? [];
                    const inMonth = d.getMonth() === month.getMonth();

                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => navigate('/utilities/calendar')}
                            title={items.map((i) => i.title).join('\n') || undefined}
                            className={`flex min-h-[64px] flex-col items-stretch gap-0.5 p-1 text-left transition hover:bg-brand-50 ${inMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-400'}`}
                        >
                            <span className={`self-end rounded-full px-1.5 text-[11.5px] font-semibold ${key === today ? 'bg-accent text-white' : ''}`}>{d.getDate()}</span>
                            {items.slice(0, 2).map((i) => (
                                <span
                                    key={i.id}
                                    className="truncate rounded px-1 text-[10.5px] font-medium text-white"
                                    style={{
                                        backgroundColor: i.color || '#28B8DA',
                                    }}
                                >
                                    {i.title}
                                </span>
                            ))}
                            {items.length > 2 && <span className="px-1 text-[10px] font-semibold text-slate-500">+{items.length - 2} more</span>}
                        </button>
                    );
                })}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" /> Events, task due dates, reminders and more — click a day to open the full calendar.
            </p>
        </Card>
    );
}
