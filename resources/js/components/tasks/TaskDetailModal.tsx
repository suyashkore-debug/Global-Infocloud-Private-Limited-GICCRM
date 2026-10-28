import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, Clock, Copy, MoreHorizontal, Pencil, Play, Plus, Square, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { TASK_PRIORITIES, TASK_STATUSES, optionById } from '../../lib/constants';
import { emit, TASKS_CHANGED, TIMERS_CHANGED } from '../../lib/events';
import { formatClock, formatDate, formatDateTime, formatDuration, formatMoney, isOverdue } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { useStaff } from '../../hooks/useStaff';
import { AttachmentList } from '../comments/AttachmentList';
import { CommentBox, MentionText } from '../comments/Mentions';
import { Avatar, Button, Checkbox, ErrorNote, Field, IconButton, Input, Menu, MenuItem, Modal, ProgressBar, Select, Spinner, StatusBadge, Tag, Textarea } from '../ui';
import { useToast } from '../ui/Toast';
import type { Staff, TaskDetail } from '../../types';
import TaskFormModal from './TaskFormModal';
import { CustomFieldsView } from '../customfields/CustomFields';


export default function TaskDetailModal({ taskId, onClose, onOpenTask }: { taskId: number | null; onClose: () => void; onOpenTask: (id: number) => void }) {
    const toast = useToast();
    const { user } = useAuth();
    const staff = useStaff();
    const [task, setTask] = useState<TaskDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [stopNote, setStopNote] = useState<string | null>(null);

    async function load(id = taskId) {
        if (!id) {
            return;
        }
        try {
            const { data } = await api.get<{ data: TaskDetail }>(`/tasks/${id}`);
            setTask(data.data);
            setError(null);
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    useEffect(() => {
        setTask(null);
        setError(null);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId]);

    const myRunningTimer = task?.timers.find((t) => t.is_running && t.is_own);
    useEffect(() => {
        if (!myRunningTimer) {
            return;
        }
        const interval = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(interval);
    }, [myRunningTimer]);

    /** Run an API call, then reload the task and tell lists to refresh. */
    async function act(call: () => Promise<unknown>, success?: string) {
        try {
            await call();
            if (success) {
                toast(success);
            }
            await load();
            emit(TASKS_CHANGED);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    if (!taskId) {
        return null;
    }

    const can = task?.can ?? { update: false, delete: false, work: false, track_time: false };
    const status = optionById(TASK_STATUSES, task?.status);
    const checklistDone = task?.checklist.filter((c) => c.finished).length ?? 0;

    async function remove() {
        if (!task || !confirm('Delete this task?')) {
            return;
        }
        await act(() => api.delete(`/tasks/${task.id}`), 'Task deleted.');
        onClose();
    }

    async function copy() {
        if (!task) {
            return;
        }
        try {
            const { data } = await api.post<{ data: TaskDetail }>(`/tasks/${task.id}/copy`, { copy_assignees: true, copy_followers: true, copy_checklist: true, status: 1 });
            toast('Task copied.');
            emit(TASKS_CHANGED);
            onOpenTask(data.data.id);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function startTimer() {
        if (!task) {
            return;
        }
        await act(() => api.post(`/tasks/${task.id}/timers/start`), 'Timer started.');
        emit(TIMERS_CHANGED);
    }

    async function stopTimer() {
        if (!myRunningTimer) {
            return;
        }
        await act(() => api.post(`/timers/${myRunningTimer.id}/stop`, { note: stopNote }), 'Timer stopped.');
        setStopNote(null);
        emit(TIMERS_CHANGED);
    }

    const othersRunning = task?.timers.filter((t) => t.is_running && !t.is_own) ?? [];

    return (
        <>
            <Modal
                open={!editing}
                onClose={onClose}
                size="xl"
                title={
                    task ? (
                        <span className="flex flex-wrap items-center gap-2">
                            {task.name}
                            <StatusBadge option={status} />
                        </span>
                    ) : (
                        'Task'
                    )
                }
            >
                <ErrorNote message={error} />
                {!task && !error && <Spinner />}
                {task && (
                    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                        {/* ── Main column ── */}
                        <div className="min-w-0 space-y-6">
                            <div className="flex flex-wrap items-center gap-2">
                                {can.work && task.status !== 5 && (
                                    <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`/tasks/${task.id}/status`, { status: 5 }), 'Task marked as complete.')}>
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Mark complete
                                    </Button>
                                )}
                                {can.work && task.status === 5 && (
                                    <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`/tasks/${task.id}/status`, { status: 4 }), 'Task reopened.')}>
                                        Unmark complete
                                    </Button>
                                )}
                                {myRunningTimer ? (
                                    <div className="relative">
                                        <Button size="sm" variant="danger" onClick={() => setStopNote(stopNote === null ? '' : null)}>
                                            <Square className="h-3.5 w-3.5" /> Stop timer {formatClock((now - new Date(myRunningTimer.start_time).getTime()) / 1000)}
                                        </Button>
                                        {stopNote !== null && (
                                            <div className="absolute left-0 top-full z-20 mt-1 w-72 space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                                                <p className="text-sm font-semibold">Stop Timer</p>
                                                <Textarea rows={3} placeholder="Note" value={stopNote} onChange={(e) => setStopNote(e.target.value)} autoFocus />
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="secondary" onClick={() => setStopNote(null)}>
                                                        Cancel
                                                    </Button>
                                                    <Button size="sm" onClick={stopTimer}>
                                                        Save
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    task.status !== 5 && (
                                        <span title={can.track_time ? undefined : 'Only task assignees can start a timer'}>
                                            <Button size="sm" variant="secondary" onClick={startTimer} disabled={!can.track_time}>
                                                <Play className="h-3.5 w-3.5" /> Start timer
                                            </Button>
                                        </span>
                                    )
                                )}
                                <div className="ml-auto">
                                    <Menu
                                        trigger={(toggle) => (
                                            <IconButton label="More actions" onClick={toggle}>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </IconButton>
                                        )}
                                    >
                                        {(close) => (
                                            <>
                                                {can.update && (
                                                    <MenuItem onClick={() => (close(), setEditing(true))}>
                                                        <Pencil className="h-4 w-4" /> Edit
                                                    </MenuItem>
                                                )}
                                                <MenuItem onClick={() => (close(), copy())}>
                                                    <Copy className="h-4 w-4" /> Copy task
                                                </MenuItem>
                                                {can.delete && (
                                                    <MenuItem danger onClick={() => (close(), remove())}>
                                                        <Trash2 className="h-4 w-4" /> Delete
                                                    </MenuItem>
                                                )}
                                            </>
                                        )}
                                    </Menu>
                                </div>
                            </div>

                            {othersRunning.length > 0 && (
                                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                                    Timer started by {othersRunning.map((t) => t.user?.full_name).join(', ')}
                                </p>
                            )}
                            <CustomFieldsView to="tasks" id={task.id} />
                            <Section title="Description">
                                {task.description ? <p className="whitespace-pre-wrap text-sm text-gray-700">{task.description}</p> : <p className="text-sm text-gray-400">No description.</p>}
                            </Section>

                            <Checklist task={task} canWork={can.work} staff={staff} act={act} done={checklistDone} />

                            <Section title={`Attachments (${task.attachments.length})`}>
                                <AttachmentList
                                    files={task.attachments}
                                    canDelete={(file) => file.is_own || can.update}
                                    onDelete={(file) => confirm(`Delete ${file.original_name}?`) && act(() => api.delete(`/files/${file.id}`), 'File deleted.')}
                                />
                                <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                                    <Upload className="h-4 w-4" /> Upload files
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files ?? []);
                                            e.target.value = '';
                                            if (files.length) {
                                                const body = new FormData();
                                                files.forEach((f) => body.append('files[]', f));
                                                act(() => api.post(`/tasks/${task.id}/attachments`, body), 'Uploaded.');
                                            }
                                        }}
                                    />
                                </label>
                            </Section>

                            <Timesheets task={task} staff={staff} act={act} canLogForOthers={can.update} />

                            <Section title={`Comments (${task.comments.length})`}>
                                <ul className="space-y-4">
                                    {task.comments.map((comment) => (
                                        <CommentItem key={comment.id} comment={comment} staff={staff} canManage={comment.is_own || can.update} act={act} />
                                    ))}
                                </ul>
                                <div className="mt-4">
                                    <CommentBox staff={staff} onSubmit={(content) => act(() => api.post(`/tasks/${task.id}/comments`, { content }))} />
                                </div>
                            </Section>
                        </div>

                        {/* ── Sidebar ── */}
                        <aside className="space-y-5 rounded-xl bg-gray-50 p-4 text-sm">
                            <Info label="Status">
                                {can.work ? (
                                    <Select value={task.status} onChange={(e) => act(() => api.post(`/tasks/${task.id}/status`, { status: Number(e.target.value) }))}>
                                        {TASK_STATUSES.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                ) : (
                                    <StatusBadge option={status} />
                                )}
                            </Info>
                            <Info label="Priority">
                                {can.update ? (
                                    <Select value={task.priority} onChange={(e) => act(() => api.post(`/tasks/${task.id}/priority`, { priority: Number(e.target.value) }))}>
                                        {TASK_PRIORITIES.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </Select>
                                ) : (
                                    <StatusBadge option={optionById(TASK_PRIORITIES, task.priority)} />
                                )}
                            </Info>
                            <div className="grid grid-cols-2 gap-3">
                                <Info label="Start date">{formatDate(task.start_date)}</Info>
                                <Info label="Due date">
                                    <span className={isOverdue(task.due_date, task.status) ? 'font-medium text-red-600' : ''}>{formatDate(task.due_date)}</span>
                                </Info>
                                <Info label="Hourly rate">{formatMoney(task.hourly_rate)}</Info>
                                <Info label="Billable">
                                    {task.invoice_id ? (
                                        <Link to={`/invoices/${task.invoice_id}`} className="font-medium text-emerald-700 hover:underline">
                                            Billed
                                        </Link>
                                    ) : task.billable ? (
                                        'Yes'
                                    ) : (
                                        'No'
                                    )}
                                </Info>
                                <Info label="Logged time">{formatDuration(task.total_logged_seconds)}</Info>
                                <Info label="Finished">{task.date_finished ? formatDateTime(task.date_finished) : '—'}</Info>
                            </div>
                            {task.repeat_every && (
                                <Info label="Recurring">
                                    Every {task.repeat_every} {task.recurring_type}(s) · {task.cycles ? `${task.total_cycles}/${task.cycles} cycles` : 'infinite'}
                                </Info>
                            )}
                            {task.project && (
                                <Info label="Project">
                                    <Link to={`/projects/${task.project.id}`} onClick={onClose} className="font-medium text-blue-700 hover:underline">
                                        {task.project.name}
                                    </Link>
                                    {task.milestone && <span className="block text-xs text-gray-500">Milestone: {task.milestone.name}</span>}
                                </Info>
                            )}
                            {task.tags && task.tags.length > 0 && (
                                <Info label="Tags">
                                    <div className="flex flex-wrap gap-1">
                                        {task.tags.map((t) => (
                                            <Tag key={t}>{t}</Tag>
                                        ))}
                                    </div>
                                </Info>
                            )}

                            <People
                                title="Assignees"
                                people={task.assignees ?? []}
                                staff={staff}
                                canAdd={can.update}
                                canRemove={() => can.update}
                                onAdd={(id) => act(() => api.post(`/tasks/${task.id}/assignees`, { user_id: id }))}
                                onRemove={(id) => act(() => api.delete(`/tasks/${task.id}/assignees/${id}`))}
                            />
                            <People
                                title="Followers"
                                people={task.followers ?? []}
                                staff={staff}
                                canAdd={can.update}
                                canRemove={(id) => can.update || id === user?.id}
                                onAdd={(id) => act(() => api.post(`/tasks/${task.id}/followers`, { user_id: id }))}
                                onRemove={(id) => act(() => api.delete(`/tasks/${task.id}/followers/${id}`))}
                                extra={
                                    !task.is_follower &&
                                    user && (
                                        <button type="button" onClick={() => act(() => api.post(`/tasks/${task.id}/followers`, { user_id: user.id }), 'You are following this task.')} className="text-xs font-medium text-blue-700 hover:underline">
                                            Follow
                                        </button>
                                    )
                                }
                            />

                            <Reminders task={task} act={act} />

                            <p className="text-xs text-gray-400">
                                Created by {task.created_by?.full_name ?? '—'} · {formatDateTime(task.created_at)}
                            </p>
                        </aside>
                    </div>
                )}
            </Modal>

            <TaskFormModal
                open={editing}
                task={task}
                onClose={() => setEditing(false)}
                onSaved={() => {
                    setEditing(false);
                    load();
                    emit(TASKS_CHANGED);
                }}
            />
        </>
    );
}

type Act = (call: () => Promise<unknown>, success?: string) => Promise<void>;

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
    return (
        <section>
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
                {action}
            </div>
            {children}
        </section>
    );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
            <div className="text-gray-800">{children}</div>
        </div>
    );
}

function Checklist({ task, canWork, staff, act, done }: { task: TaskDetail; canWork: boolean; staff: Staff[]; act: Act; done: number }) {
    const [draft, setDraft] = useState('');
    const [asTemplate, setAsTemplate] = useState(false);
    const total = task.checklist.length;

    return (
        <Section title={`Checklist items ${total ? `(${done}/${total})` : ''}`}>
            {total > 0 && (
                <div className="mb-3">
                    <ProgressBar value={(done / total) * 100} color="#22c55e" />
                </div>
            )}
            <ul className="space-y-1.5">
                {task.checklist.map((item) => (
                    <li key={item.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={item.finished}
                            disabled={!canWork}
                            onChange={(e) => act(() => api.put(`/checklist-items/${item.id}`, { finished: e.target.checked }))}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600"
                        />
                        <div className="min-w-0 flex-1">
                            <p className={`text-sm ${item.finished ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.description}</p>
                            {(item.finished_by || item.assigned_to) && (
                                <p className="text-xs text-gray-400">
                                    {item.finished_by && `Completed by ${item.finished_by.full_name}`}
                                    {item.assigned_to && ` · Assigned to ${item.assigned_to.full_name}`}
                                </p>
                            )}
                        </div>
                        {canWork && (
                            <>
                                <select
                                    value={item.assigned_to?.id ?? ''}
                                    onChange={(e) => act(() => api.put(`/checklist-items/${item.id}`, { assigned_to: e.target.value ? Number(e.target.value) : null }))}
                                    className="hidden max-w-[8rem] rounded border border-gray-200 bg-white px-1 py-0.5 text-xs group-hover:block"
                                    title="Assign"
                                >
                                    <option value="">Assign…</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </select>
                                <button type="button" onClick={() => act(() => api.delete(`/checklist-items/${item.id}`))} className="hidden text-gray-400 hover:text-red-600 group-hover:block" title="Delete">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {canWork && (
                <form
                    className="mt-2 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim()) {
                            act(() => api.post(`/tasks/${task.id}/checklist`, { description: draft.trim(), save_as_template: asTemplate }));
                            setDraft('');
                        }
                    }}
                >
                    <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add checklist item" className="flex-1" />
                    <Button type="submit" size="sm" variant="secondary">
                        <Plus className="h-4 w-4" /> Add
                    </Button>
                    <Checkbox label="Save as template" checked={asTemplate} onChange={setAsTemplate} />
                </form>
            )}
        </Section>
    );
}

/** datetime-local value (browser time) ⇄ ISO instant, so times are stored in the right zone. */
const toInstant = (local: string) => (local ? new Date(local).toISOString() : '');
const toLocalInput = (iso: string | null) => {
    if (!iso) {
        return '';
    }
    const d = new Date(iso);

    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

type TimesheetForm = { duration: string; start_time: string; end_time: string; note: string; user_id: string };
const blankTimesheet: TimesheetForm = { duration: '', start_time: '', end_time: '', note: '', user_id: '' };

function Timesheets({ task, staff, act, canLogForOthers }: { task: TaskDetail; staff: Staff[]; act: Act; canLogForOthers: boolean }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [stopping, setStopping] = useState<{ id: number; note: string } | null>(null);
    const canLog = task.can?.track_time || canLogForOthers;
    const assignees = staff.filter((s) => (task.assignees ?? []).some((a) => a.id === s.id));

    async function save(form: TimesheetForm, mode: 'duration' | 'range', timerId?: number) {
        const payload = mode === 'duration' ? { duration: form.duration, note: form.note } : { start_time: toInstant(form.start_time), end_time: toInstant(form.end_time), note: form.note };
        const body = { ...payload, user_id: form.user_id ? Number(form.user_id) : null };
        await act(() => (timerId ? api.put(`/timesheets/${timerId}`, body) : api.post(`/tasks/${task.id}/timesheets`, body)), timerId ? 'Timesheet updated.' : 'Time logged.');
        setOpen(false);
        setEditing(null);
        emit(TIMERS_CHANGED);
    }

    return (
        <Section
            title={`Timesheets (${formatDuration(task.total_logged_seconds)})`}
            action={
                canLog && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
                        <Clock className="h-4 w-4" /> Add timesheet
                    </Button>
                )
            }
        >
            {open && <TimesheetEditor staff={canLogForOthers ? assignees : []} onCancel={() => setOpen(false)} onSave={(f, m) => save(f, m)} />}
            {task.timers.length === 0 ? (
                <p className="text-sm text-gray-400">No started timers found.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 text-left text-gray-500">
                            <tr>
                                <th className="px-3 py-2">Member</th>
                                <th className="px-3 py-2">Start Time</th>
                                <th className="px-3 py-2">End Time</th>
                                <th className="px-3 py-2">Time Spent</th>
                                <th className="px-3 py-2">Note</th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {task.timers.map((timer) =>
                                editing === timer.id ? (
                                    <tr key={timer.id}>
                                        <td colSpan={6} className="p-2">
                                            <TimesheetEditor
                                                staff={canLogForOthers ? assignees : []}
                                                initial={{ duration: '', start_time: toLocalInput(timer.start_time), end_time: toLocalInput(timer.end_time), note: timer.note ?? '', user_id: String(timer.user?.id ?? '') }}
                                                rangeOnly
                                                onCancel={() => setEditing(null)}
                                                onSave={(f, m) => save(f, m, timer.id)}
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={timer.id}>
                                        <td className="whitespace-nowrap px-3 py-2">{timer.user?.full_name}</td>
                                        <td className="whitespace-nowrap px-3 py-2">{formatDateTime(timer.start_time)}</td>
                                        <td className="whitespace-nowrap px-3 py-2">
                                            {!timer.is_running ? (
                                                formatDateTime(timer.end_time)
                                            ) : !timer.is_own && canLogForOthers ? (
                                                stopping?.id === timer.id ? (
                                                    <span className="flex items-center gap-1">
                                                        <Input value={stopping.note} placeholder="Note" onChange={(e) => setStopping({ id: timer.id, note: e.target.value })} className="h-7 w-32 text-xs" />
                                                        <Button size="sm" onClick={() => act(() => api.post(`/timers/${timer.id}/stop`, { note: stopping.note }), 'Timer stopped.').then(() => (setStopping(null), emit(TIMERS_CHANGED)))}>
                                                            Save
                                                        </Button>
                                                    </span>
                                                ) : (
                                                    <button type="button" onClick={() => setStopping({ id: timer.id, note: '' })} className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white hover:bg-red-700">
                                                        Stop Timer
                                                    </button>
                                                )
                                            ) : (
                                                <span className="font-medium text-emerald-600">Running</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2">
                                            {formatClock(timer.duration_seconds)}
                                            <span className="block text-gray-400">{(timer.duration_seconds / 3600).toFixed(2)} h</span>
                                        </td>
                                        <td className="max-w-[12rem] whitespace-pre-wrap px-3 py-2 text-gray-500">{timer.note}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            {(timer.is_own || canLogForOthers) && (
                                                <span className="inline-flex gap-2">
                                                    {!timer.is_running && (
                                                        <button type="button" onClick={() => setEditing(timer.id)} className="text-gray-400 hover:text-blue-600" title="Edit">
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => confirm('Delete this timesheet?') && act(() => api.delete(`/timesheets/${timer.id}`), 'Timesheet deleted.').then(() => emit(TIMERS_CHANGED))} className="text-gray-400 hover:text-red-600" title="Delete">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

/** Perfex timesheet form: start / end time, or a h:mm duration ending now. */
function TimesheetEditor({ staff, initial, rangeOnly, onCancel, onSave }: { staff: Staff[]; initial?: TimesheetForm; rangeOnly?: boolean; onCancel: () => void; onSave: (form: TimesheetForm, mode: 'duration' | 'range') => void }) {
    const [mode, setMode] = useState<'duration' | 'range'>('range');
    const [form, setForm] = useState<TimesheetForm>(initial ?? blankTimesheet);

    return (
        <div className="mb-3 space-y-3 rounded-lg border border-gray-200 p-3">
            {!rangeOnly && (
                <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                        <input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} /> Start / End time
                    </label>
                    <label className="flex items-center gap-1.5">
                        <input type="radio" checked={mode === 'duration'} onChange={() => setMode('duration')} /> Time spent (HH:MM)
                    </label>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                {mode === 'duration' ? (
                    <Field label="Time spent">
                        <Input placeholder="HH:MM" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
                    </Field>
                ) : (
                    <>
                        <Field label="Start Time">
                            <Input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                        </Field>
                        <Field label="End Time">
                            <Input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                        </Field>
                    </>
                )}
                {staff.length > 0 && (
                    <Field label="Member">
                        <Select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                            <option value="">Me</option>
                            {staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.full_name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}
            </div>
            <Textarea rows={2} placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" onClick={() => onSave(form, mode)}>
                    Save
                </Button>
            </div>
        </div>
    );
}

function CommentItem({ comment, staff, canManage, act }: { comment: TaskDetail['comments'][number]; staff: Staff[]; canManage: boolean; act: Act }) {
    const [editing, setEditing] = useState(false);

    return (
        <li className="flex gap-3">
            <Avatar id={comment.user?.id} name={comment.user?.full_name ?? comment.contact?.name} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">
                        {comment.user?.full_name ?? comment.contact?.name}
                        {comment.contact && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-semibold uppercase text-amber-700">Customer</span>}
                    </span>
                    {formatDateTime(comment.created_at)}
                    {canManage && !editing && (
                        <span className="ml-auto flex gap-2">
                            {comment.is_own && (
                                <button type="button" onClick={() => setEditing(true)} className="hover:text-gray-800">
                                    Edit
                                </button>
                            )}
                            <button type="button" onClick={() => confirm('Delete this comment?') && act(() => api.delete(`/task-comments/${comment.id}`))} className="hover:text-red-600">
                                Delete
                            </button>
                        </span>
                    )}
                </div>
                {editing ? (
                    <div className="mt-1">
                        <CommentBox
                            staff={staff}
                            initial={comment.content ?? ''}
                            submitLabel="Save"
                            onCancel={() => setEditing(false)}
                            onSubmit={async (content) => {
                                await act(() => api.put(`/task-comments/${comment.id}`, { content }));
                                setEditing(false);
                            }}
                        />
                    </div>
                ) : (
                    <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2">
                        <MentionText text={comment.content} />
                    </div>
                )}
            </div>
        </li>
    );
}

function People({
    title,
    people,
    staff,
    canAdd,
    canRemove,
    onAdd,
    onRemove,
    extra,
}: {
    title: string;
    people: Staff[];
    staff: Staff[];
    canAdd: boolean;
    canRemove: (id: number) => boolean;
    onAdd: (id: number) => void;
    onRemove: (id: number) => void;
    extra?: ReactNode;
}) {
    const available = staff.filter((s) => !people.some((p) => p.id === s.id));

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</span>
                {extra}
            </div>
            <ul className="space-y-1.5">
                {people.map((person) => (
                    <li key={person.id} className="flex items-center gap-2">
                        <Avatar id={person.id} name={person.full_name} size="sm" />
                        <span className="flex-1 truncate">{person.full_name}</span>
                        {canRemove(person.id) && (
                            <button type="button" onClick={() => onRemove(person.id)} className="text-gray-400 hover:text-red-600" title="Remove">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </li>
                ))}
                {people.length === 0 && <li className="text-xs text-gray-400">None</li>}
            </ul>
            {canAdd && available.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                    <UserPlus className="h-4 w-4 text-gray-400" />
                    <select value="" onChange={(e) => e.target.value && onAdd(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs">
                        <option value="">Add {title.toLowerCase().replace(/s$/, '')}…</option>
                        {available.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.full_name}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}

function Reminders({ task, act }: { task: TaskDetail; act: Act }) {
    const [open, setOpen] = useState(false);
    const [remindAt, setRemindAt] = useState('');
    const [description, setDescription] = useState('');
    const [byEmail, setByEmail] = useState(false);

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">My reminders</span>
                <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-blue-700 hover:underline">
                    <Bell className="mr-1 inline h-3 w-3" />
                    Remind me
                </button>
            </div>
            {open && (
                <div className="mb-2 space-y-2">
                    <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
                    <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
                    <Checkbox label="Send also an email for this reminder" checked={byEmail} onChange={setByEmail} />
                    <Button
                        size="sm"
                        className="w-full"
                        disabled={!remindAt}
                        onClick={async () => {
                            await act(() => api.post(`/tasks/${task.id}/reminders`, { remind_at: remindAt, description, notify_by_email: byEmail }), 'Reminder set.');
                            setOpen(false);
                            setRemindAt('');
                            setDescription('');
                        }}
                    >
                        Set reminder
                    </Button>
                </div>
            )}
            <ul className="space-y-1">
                {task.reminders.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-xs">
                        <span className={`flex-1 ${r.is_notified ? 'text-gray-400 line-through' : ''}`}>
                            {formatDateTime(r.remind_at)}
                            {r.description && ` — ${r.description}`}
                        </span>
                        <button type="button" onClick={() => act(() => api.delete(`/task-reminders/${r.id}`))} className="text-gray-400 hover:text-red-600">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
