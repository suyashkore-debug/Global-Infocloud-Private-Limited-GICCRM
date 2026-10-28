import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useTaskModals } from '../../components/tasks/TaskModalHost';
import { BarChart } from '../../components/charts/BarChart';
import { Button, Checkbox, Input, Select, Spinner } from '../../components/ui';
import LoggedTimeStats, { type LoggedTime } from './LoggedTimeStats';

type Row = {
    id: number;
    staff: { id: number; full_name: string | null };
    task: { id: number; name: string };
    project: { id: number; name: string; customer: string | null } | null;
    start_time: string | null;
    end_time: string | null;
    note: string | null;
    seconds: number;
};

type Reply = {
    data: Row[];
    meta: {
        view_all: boolean;
        can_view_all: boolean;
        total_seconds: number;
        chart: { labels: string[]; data: number[] };
        stats: LoggedTime;
        staff: { id: number; full_name: string }[];
    };
};

const RANGES = [
    ['today', 'Today'],
    ['this_month', 'This Month'],
    ['last_month', 'Last Month'],
    ['this_week', 'This Week'],
    ['last_week', 'Last Week'],
    ['period', 'Period'],
] as const;

const hoursDecimal = (seconds: number) => (seconds / 3600).toFixed(2);

/** Perfex "My Timesheets" (and, with the reports permission, every member's timesheets). */
export default function MyTimesheetsPage() {
    const { openTask } = useTaskModals();
    const [params] = useSearchParams();
    const [viewAll, setViewAll] = useState(params.get('view') === 'all');
    const [filters, setFilters] = useState({ range: 'this_month', from: '', to: '', staff_id: '', customer_id: '', project_id: '' });
    const [applied, setApplied] = useState(filters);
    const [groupByTask, setGroupByTask] = useState(false);
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        api.get<{ data: { id: number; name: string }[] }>('/customers/options').then((r) => setCustomers(r.data.data)).catch(() => undefined);
        api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { per_page: 200 } }).then((r) => setProjects(r.data.data)).catch(() => undefined);
    }, []);

    const ready = applied.range !== 'period' || (applied.from && applied.to);
    const { data, loading } = useApi<Reply>(ready ? '/my-timesheets' : null, {
        range: applied.range,
        from: applied.range === 'period' ? applied.from : undefined,
        to: applied.range === 'period' ? applied.to : undefined,
        view_all: viewAll ? 1 : undefined,
        staff_id: viewAll ? applied.staff_id || undefined : undefined,
        customer_id: applied.customer_id || undefined,
        'project_ids[]': applied.project_id || undefined,
        group_by_task: groupByTask ? 1 : undefined,
    });
    const showStaff = data?.meta.view_all ?? false;
    const chartLabels = (data?.meta.chart.labels ?? []).map((d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));

    return (
        <div className="w-full space-y-6">
            {!viewAll && data && <LoggedTimeStats stats={data.meta.stats} />}
            <div className="panel_s">
                <div className="panel-body space-y-4">
                    {data?.meta.can_view_all && (
                        <>
                            <Button onClick={() => setViewAll(!viewAll)}>
                                <Clock className="h-4 w-4" /> {viewAll ? 'My Timesheets' : "View Members' Timesheets"}
                            </Button>
                            <hr className="border-gray-200" />
                        </>
                    )}
                    {data && (
                        <BarChart
                            labels={chartLabels}
                            series={[{ name: 'Logged time', values: data.meta.chart.data.map((s) => +(s / 3600).toFixed(2)) }]}
                            format={(v) => `${v.toFixed(2)} h`}
                            height={260}
                        />
                    )}
                    <hr className="border-gray-200" />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-2">
                            <Select value={filters.range} onChange={(e) => setFilters({ ...filters, range: e.target.value })}>
                                {RANGES.map(([id, label]) => (
                                    <option key={id} value={id}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                            {filters.range === 'period' && (
                                <>
                                    <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
                                    <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
                                </>
                            )}
                        </div>
                        {viewAll && (
                            <Select value={filters.staff_id} onChange={(e) => setFilters({ ...filters, staff_id: e.target.value })}>
                                <option value="">All staff members</option>
                                {data?.meta.staff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.full_name}
                                    </option>
                                ))}
                            </Select>
                        )}
                        <Select value={filters.customer_id} onChange={(e) => setFilters({ ...filters, customer_id: e.target.value })}>
                            <option value="">Customer</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                        <Select value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}>
                            <option value="">Project</option>
                            {projects.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                    {pr.name}
                                </option>
                            ))}
                        </Select>
                        <div>
                            <Button onClick={() => setApplied(filters)}>Apply</Button>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Checkbox label="Group by task" checked={groupByTask} onChange={setGroupByTask} />
                    </div>
                    {loading && !data ? (
                        <Spinner />
                    ) : (
                        <div className="-mx-4 overflow-x-auto">
                            <table className="table-perfex">
                                <thead>
                                    <tr>
                                        {showStaff && <th>Staff Member</th>}
                                        <th>Task</th>
                                        {!groupByTask && <th>Start Time</th>}
                                        {!groupByTask && <th>End Time</th>}
                                        {!groupByTask && <th>Note</th>}
                                        <th>Related</th>
                                        <th className="text-right">Time (h)</th>
                                        <th className="text-right">Time (decimal)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.data ?? []).map((r) => (
                                        <tr key={`${r.id}-${r.staff.id}`}>
                                            {showStaff && <td>{r.staff.full_name}</td>}
                                            <td>
                                                <button type="button" onClick={() => openTask(r.task.id)} className="text-left font-medium text-blue-600 hover:underline">
                                                    {r.task.name}
                                                </button>
                                            </td>
                                            {!groupByTask && <td className="whitespace-nowrap">{formatDateTime(r.start_time)}</td>}
                                            {!groupByTask && <td className="whitespace-nowrap">{r.end_time ? formatDateTime(r.end_time) : <span className="text-green-600">Running</span>}</td>}
                                            {!groupByTask && <td className="max-w-[200px] truncate" title={r.note ?? ''}>{r.note}</td>}
                                            <td>
                                                {r.project && (
                                                    <Link to={`/projects/${r.project.id}`} className="text-blue-600 hover:underline">
                                                        {r.project.name}
                                                    </Link>
                                                )}
                                                {r.project?.customer && <span className="block text-xs text-gray-500">{r.project.customer}</span>}
                                            </td>
                                            <td className="text-right">{formatDuration(r.seconds) || '00:00'}</td>
                                            <td className="text-right">{hoursDecimal(r.seconds)}</td>
                                        </tr>
                                    ))}
                                    {data?.data.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="text-center text-gray-500">
                                                No time logged in this range.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {data && data.data.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-gray-50 font-semibold">
                                            <td colSpan={(showStaff ? 1 : 0) + (groupByTask ? 2 : 5)}>Total</td>
                                            <td className="text-right">{formatDuration(data.meta.total_seconds)}</td>
                                            <td className="text-right">{hoursDecimal(data.meta.total_seconds)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
