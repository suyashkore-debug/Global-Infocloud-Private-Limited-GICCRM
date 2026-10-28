import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, FileText, Hourglass, Landmark, Wallet, type LucideIcon } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { PROJECT_STATUSES, optionById } from '../../lib/constants';
import { Card, ErrorNote, ProgressBar, Spinner, StatusBadge } from '../../components/ui';
import ColumnPairChart from '../../components/charts/ColumnPairChart';
import BarList from '../../components/charts/BarList';

type Amount = { label: string; amount: number };
type Count = { label: string; count: number };

interface Management {
    period: { key: string; from: string; to: string };
    kpis: { invoiced: number; received: number; expenses: number; net: number; outstanding: number; avg_days_to_pay: number | null };
    cash: { months: string[]; income: number[]; expenses: number[] };
    aging: (Amount & { count: number })[];
    top_customers: Amount[];
    sales_by_agent: Amount[];
    expense_categories: Amount[];
    team: { name: string; seconds: number; billable_seconds: number }[];
    projects: { id: number; name: string; customer: string | null; status: number; progress: number; hours: number; value: number; invoiced: number; deadline: string | null; late: boolean }[];
    leads: { new: number[]; converted: number[]; total_new: number; total_converted: number; by_source: Count[] };
    tickets: { opened: number; by_department: Count[] };
}

const PERIODS = [
    { key: 'month', label: 'This month' },
    { key: 'quarter', label: 'Last 3 months' },
    { key: 'fy', label: 'This financial year' },
    { key: 'year', label: 'Last 12 months' },
] as const;

const rupees = (n: number) => money(n).replace(/\.00$/, '');
const hours = (s: number) => `${(s / 3600).toFixed(1)} h`;
// Lateness reads as severity: grey (not due) → amber → orange → red.
const AGING_COLORS = ['#94a3b8', '#f59e0b', '#f97316', '#ef4444', '#b91c1c'];

/**
 * Reports → Management dashboard: one page for the owners — money in and out, who owes and for
 * how long, best customers, sales people, where money goes, projects, team time, leads and support.
 */
export default function ManagementDashboardPage() {
    const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('year');
    const { data, error, loading } = useApi<{ data: Management }>('/reports/management', { period });
    const m = data?.data;

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h4 className="page-title">Management dashboard</h4>
                    <p className="text-[13px] text-slate-500">{m ? `${formatDate(m.period.from)} – ${formatDate(m.period.to)}` : ' '}</p>
                </div>
                <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Period">
                    {PERIODS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            role="tab"
                            aria-selected={period === p.key}
                            onClick={() => setPeriod(p.key)}
                            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${period === p.key ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <ErrorNote message={error} />
            {!m ? (
                <Card className="p-5">
                    <Spinner rows={8} />
                </Card>
            ) : (
                <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <Kpi icon={FileText} label="Invoiced" value={rupees(m.kpis.invoiced)} to="/invoices" />
                        <Kpi icon={Banknote} label="Received" value={rupees(m.kpis.received)} to="/payments" />
                        <Kpi icon={Wallet} label="Expenses" value={rupees(m.kpis.expenses)} to="/expenses" />
                        <Kpi icon={m.kpis.net >= 0 ? ArrowUpRight : ArrowDownRight} label="Net (received − expenses)" value={rupees(m.kpis.net)} tone={m.kpis.net < 0 ? 'critical' : 'good'} />
                        <Kpi icon={Landmark} label="Outstanding now" value={rupees(m.kpis.outstanding)} to="/invoices" />
                        <Kpi icon={Hourglass} label="Avg days to get paid" value={m.kpis.avg_days_to_pay === null ? '—' : `${m.kpis.avg_days_to_pay} days`} />
                    </div>

                    <div className="grid gap-5 lg:grid-cols-3">
                        <Card className="p-5 lg:col-span-2">
                            <Head title="Cash flow" sub="Payments received vs expenses, by month" link="/reports/expenses-vs-income" />
                            <ColumnPairChart
                                categories={m.cash.months}
                                series={[
                                    { key: 'income', label: 'Income', color: 'var(--viz-income)', values: m.cash.income },
                                    { key: 'expenses', label: 'Expenses', color: 'var(--viz-expense)', values: m.cash.expenses },
                                ]}
                                format={rupees}
                            />
                        </Card>
                        <Card className="p-5">
                            <Head title="Who owes us, how late" sub={`${rupees(m.kpis.outstanding)} unpaid today`} link="/invoices" />
                            <BarList rows={m.aging.map((a, i) => ({ label: a.label, value: a.amount, color: AGING_COLORS[i], hint: a.count ? `${a.count} inv.` : undefined }))} format={rupees} />
                            {m.aging.slice(2).some((a) => a.amount > 0) && (
                                <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-[12.5px] text-red-700">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    {rupees(m.aging.slice(2).reduce((s, a) => s + a.amount, 0))} is more than 30 days late — worth a call.
                                </p>
                            )}
                        </Card>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-3">
                        <Card className="p-5">
                            <Head title="Top customers" sub="Money received in the period" link="/customers" />
                            <BarList rows={m.top_customers.map((c) => ({ label: c.label, value: c.amount }))} format={rupees} />
                        </Card>
                        <Card className="p-5">
                            <Head title="Sales by sale agent" sub="Invoiced in the period" link="/reports/sales" />
                            <BarList rows={m.sales_by_agent.map((c) => ({ label: c.label, value: c.amount }))} format={rupees} />
                        </Card>
                        <Card className="p-5">
                            <Head title="Where the money goes" sub="Expenses by category" link="/reports/expenses" />
                            <BarList rows={m.expense_categories.map((c) => ({ label: c.label, value: c.amount, color: 'var(--viz-expense)' }))} format={rupees} />
                        </Card>
                    </div>

                    <Card className="p-5">
                        <Head title="Open projects" sub="Progress, time logged and money invoiced, nearest deadline first" link="/projects" />
                        {m.projects.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-400">No open projects.</p>
                        ) : (
                            <div className="-mx-5 overflow-x-auto">
                                <table className="table-perfex">
                                    <thead>
                                        <tr>
                                            <th>Project</th>
                                            <th>Status</th>
                                            <th className="w-40">Progress</th>
                                            <th className="text-right">Logged</th>
                                            <th className="text-right">Project value</th>
                                            <th className="text-right">Invoiced</th>
                                            <th>Deadline</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {m.projects.map((p) => (
                                            <tr key={p.id}>
                                                <td>
                                                    <Link to={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">
                                                        {p.name}
                                                    </Link>
                                                    <p className="text-xs text-slate-500">{p.customer}</p>
                                                </td>
                                                <td>
                                                    <StatusBadge option={optionById(PROJECT_STATUSES, p.status)} />
                                                </td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <ProgressBar value={p.progress} />
                                                        <span className="w-9 text-right text-xs font-semibold tabular-nums">{p.progress}%</span>
                                                    </div>
                                                </td>
                                                <td className="text-right tabular-nums">{p.hours} h</td>
                                                <td className="text-right tabular-nums">{p.value ? rupees(p.value) : '—'}</td>
                                                <td className="text-right tabular-nums">
                                                    {rupees(p.invoiced)}
                                                    {p.value > 0 && <p className="text-[11px] text-slate-400">{Math.round((p.invoiced / p.value) * 100)}% of value</p>}
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {p.deadline ? (
                                                        <span className={`inline-flex items-center gap-1 ${p.late ? 'font-semibold text-red-600' : ''}`}>
                                                            {p.late && <AlertTriangle className="h-3.5 w-3.5" />}
                                                            {formatDate(p.deadline)}
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    <div className="grid gap-5 lg:grid-cols-3">
                        <Card className="p-5">
                            <Head title="Team time" sub="Hours logged on tasks (billable share)" link="/reports/timesheets" />
                            <BarList rows={m.team.map((t) => ({ label: t.name, value: t.seconds, hint: t.seconds ? `${Math.round((t.billable_seconds / t.seconds) * 100)}% billable` : undefined }))} format={hours} />
                        </Card>
                        <Card className="p-5 lg:col-span-2">
                            <Head
                                title="Leads"
                                sub={`${m.leads.total_new} new · ${m.leads.total_converted} converted${m.leads.total_new ? ` · ${Math.round((m.leads.total_converted / m.leads.total_new) * 100)}% conversion` : ''}`}
                                link="/reports/leads"
                            />
                            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
                                <ColumnPairChart
                                    categories={m.cash.months}
                                    series={[
                                        { key: 'new', label: 'New leads', color: 'var(--viz-lead-new)', values: m.leads.new },
                                        { key: 'converted', label: 'Converted', color: 'var(--viz-lead-won)', values: m.leads.converted },
                                    ]}
                                    format={(n) => String(Math.round(n))}
                                    height={200}
                                    integer
                                />
                                <div>
                                    <p className="mb-3 text-[12.5px] font-semibold text-slate-500">New leads by source</p>
                                    <BarList rows={m.leads.by_source.map((s) => ({ label: s.label, value: s.count }))} unit="leads" />
                                </div>
                            </div>
                        </Card>
                    </div>

                    <Card className="p-5">
                        <Head title="Support" sub={`${m.tickets.opened} tickets opened in the period, by department`} link="/tickets" />
                        <div className="max-w-xl">
                            <BarList rows={m.tickets.by_department.map((d) => ({ label: d.label, value: d.count }))} unit="tickets" />
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

function Head({ title, sub, link }: { title: string; sub: string; link?: string }) {
    return (
        <div className="mb-4 flex items-start justify-between gap-3">
            <div>
                <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
                <p className="text-xs text-slate-500">{sub}</p>
            </div>
            {link && (
                <Link to={link} className="shrink-0 text-[12.5px] font-semibold text-brand hover:text-brand-light">
                    Details →
                </Link>
            )}
        </div>
    );
}

function Kpi({ icon: Icon, label, value, tone, to }: { icon: LucideIcon; label: string; value: string; tone?: 'good' | 'critical'; to?: string }) {
    const body = (
        <Card className="h-full p-4 transition hover:shadow-md">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone === 'critical' ? 'bg-red-50 text-red-600' : tone === 'good' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand'}`}>
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <p className="mt-3 text-[12.5px] font-medium text-slate-500">{label}</p>
            <p className={`text-[20px] font-bold leading-tight tabular-nums ${tone === 'critical' ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
        </Card>
    );

    return to ? <Link to={to}>{body}</Link> : body;
}

