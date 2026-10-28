import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import { TASK_STATUSES, optionById } from '../lib/constants';
import { formatClock, formatDate } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { useStaff } from '../hooks/useStaff';
import { Button, Select, Spinner, StatusBadge } from '../components/ui';
import { useTaskModals } from '../components/tasks/TaskModalHost';

type Row = {
    id: number;
    name: string;
    project: { id: number; name: string } | null;
    start_date: string | null;
    due_date: string | null;
    status: number;
    attachments: number;
    comments: number;
    checklist_total: number;
    checklist_finished: number;
    logged_seconds: number;
    finished_on_time: boolean | null;
    assignees: string[];
};
type Reply = { data: Record<string, Row[]>; meta: { year: number; years: number[]; can_view_all: boolean } };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Perfex Tasks → Detailed Overview: tasks per month of the year by start date. */
export default function TasksOverviewPage() {
    const staff = useStaff();
    const { openTask } = useTaskModals();
    const now = new Date();
    const [form, setForm] = useState({ member: '', month: String(now.getMonth() + 1), status: '', year: String(now.getFullYear()) });
    const [applied, setApplied] = useState(form);
    const { data } = useApi<Reply>('/tasks/overview', {
        member: applied.member || undefined,
        month: applied.month || undefined,
        status: applied.status || undefined,
        year: applied.year,
    });
    const months = Object.keys(data?.data ?? {}).map(Number).sort((a, b) => a - b);

    return (
        <div className="w-full space-y-4">
            <div>
                <h4 className="page-title">Tasks Overview</h4>
                <Link to="/tasks" className="inline-flex items-center gap-1 text-[14px] text-blue-600 hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Back to tasks list
                </Link>
            </div>
            <div className="panel_s">
                <div className="panel-body flex flex-wrap items-center gap-2">
                    {data?.meta.can_view_all && (
                        <Select value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })} className="w-56">
                            <option value="">All staff members</option>
                            {staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.full_name}
                                </option>
                            ))}
                        </Select>
                    )}
                    <Select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className="w-44">
                        <option value="">All months</option>
                        {MONTHS.map((m, i) => (
                            <option key={m} value={i + 1}>
                                {m}
                            </option>
                        ))}
                    </Select>
                    <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-56">
                        <option value="">All</option>
                        {TASK_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </Select>
                    <Select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-28">
                        {(data?.meta.years ?? [now.getFullYear()]).map((y) => (
                            <option key={y}>{y}</option>
                        ))}
                    </Select>
                    <Button onClick={() => setApplied(form)}>Filter</Button>
                </div>
            </div>
            {!data ? (
                <Spinner />
            ) : months.length === 0 ? (
                <div className="panel_s">
                    <div className="panel-body text-gray-500">No tasks found for this period.</div>
                </div>
            ) : (
                months.map((m) => (
                    <div key={m} className="panel_s overflow-hidden">
                        <h5 className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-800">{MONTHS[m - 1]}</h5>
                        <div className="overflow-x-auto">
                            <table className="table-perfex">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Start Date</th>
                                        <th>Due Date</th>
                                        <th>Status</th>
                                        <th title="Total added attachments">
                                            <Paperclip className="h-4 w-4" />
                                        </th>
                                        <th title="Total comments">
                                            <MessageSquare className="h-4 w-4" />
                                        </th>
                                        <th title="Checklist items">
                                            <CheckSquare className="h-4 w-4" />
                                        </th>
                                        <th>Total Logged Time</th>
                                        <th>Finished on time?</th>
                                        <th>Assigned to</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.data[m].map((t) => (
                                        <tr key={t.id}>
                                            <td className="min-w-[14rem]">
                                                <button type="button" onClick={() => openTask(t.id)} className="text-left font-medium text-blue-600 hover:underline">
                                                    {t.name}
                                                </button>
                                                {t.project && (
                                                    <span className="block text-xs text-gray-500">
                                                        Related To:{' '}
                                                        <Link to={`/projects/${t.project.id}`} className="hover:text-blue-600">
                                                            {t.project.name}
                                                        </Link>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap">{formatDate(t.start_date)}</td>
                                            <td className="whitespace-nowrap">{formatDate(t.due_date)}</td>
                                            <td>
                                                <StatusBadge option={optionById(TASK_STATUSES, t.status)} />
                                            </td>
                                            <td>{t.attachments}</td>
                                            <td>{t.comments}</td>
                                            <td className="whitespace-nowrap">
                                                {t.checklist_finished}/{t.checklist_total}
                                            </td>
                                            <td className="tabular-nums">{formatClock(t.logged_seconds)}</td>
                                            <td>{t.finished_on_time === null ? <span className="text-gray-400">—</span> : t.finished_on_time ? <span className="text-emerald-600">Yes</span> : <span className="text-red-600">No</span>}</td>
                                            <td className="text-[13px]">{t.assignees.join(', ')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
