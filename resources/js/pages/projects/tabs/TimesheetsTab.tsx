import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { emit, TASKS_CHANGED, TIMERS_CHANGED } from '../../../lib/events';
import { formatDateTime, formatDuration } from '../../../lib/format';
import { useApi } from '../../../hooks/useApi';
import { useEvent } from '../../../hooks/useEvent';
import { Card, EmptyState, IconButton, Pagination, Select, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { useTaskModals } from '../../../components/tasks/TaskModalHost';
import type { Paginated, Project, Timer } from '../../../types';

export default function TimesheetsTab({ project }: { project: Project }) {
    const toast = useToast();
    const { openTask } = useTaskModals();
    const [page, setPage] = useState(1);
    const [member, setMember] = useState('');
    const { data, reload } = useApi<Paginated<Timer>>(`/projects/${project.id}/timesheets`, { page, user_id: member || undefined });
    useEvent([TASKS_CHANGED, TIMERS_CHANGED], reload);

    async function remove(timer: Timer) {
        if (!confirm('Delete this timesheet?')) {
            return;
        }
        try {
            await api.delete(`/timesheets/${timer.id}`);
            toast('Timesheet deleted.');
            emit(TASKS_CHANGED);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const pageTotal = data?.data.reduce((sum, t) => sum + t.duration_seconds, 0) ?? 0;

    return (
        <div className="space-y-4">
            <Select value={member} onChange={(e) => (setMember(e.target.value), setPage(1))} className="w-auto">
                <option value="">All members</option>
                {project.members?.map((m) => (
                    <option key={m.id} value={m.id}>
                        {m.full_name}
                    </option>
                ))}
            </Select>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No timesheets yet" text="Time logged on this project's tasks shows up here. Start a timer from a task." />
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-4 py-3">Member</th>
                                    <th className="px-4 py-3">Task</th>
                                    <th className="px-4 py-3">Start time</th>
                                    <th className="px-4 py-3">End time</th>
                                    <th className="px-4 py-3">Note</th>
                                    <th className="px-4 py-3">Time (h)</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.data.map((timer) => (
                                    <tr key={timer.id}>
                                        <td className="whitespace-nowrap px-4 py-3">{timer.user?.full_name}</td>
                                        <td className="px-4 py-3">
                                            <button type="button" onClick={() => timer.task && openTask(timer.task.id)} className="text-left font-medium text-blue-700 hover:underline">
                                                {timer.task?.name}
                                            </button>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(timer.start_time)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{timer.is_running ? <span className="font-medium text-emerald-600">Running</span> : formatDateTime(timer.end_time)}</td>
                                        <td className="max-w-xs truncate px-4 py-3 text-gray-500">{timer.note}</td>
                                        <td className="px-4 py-3 font-medium">{formatDuration(timer.duration_seconds)}</td>
                                        <td className="px-4 py-3 text-right">
                                            {(timer.is_own || project.can.update) && (
                                                <IconButton label="Delete" onClick={() => remove(timer)} className="hover:text-red-600">
                                                    <Trash2 className="h-4 w-4" />
                                                </IconButton>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 text-sm">
                                    <td colSpan={5} className="px-4 py-2 text-right font-medium text-gray-500">
                                        Total on this page
                                    </td>
                                    <td className="px-4 py-2 font-semibold">{formatDuration(pageTotal)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div className="border-t border-gray-100 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </Card>
            )}
        </div>
    );
}
