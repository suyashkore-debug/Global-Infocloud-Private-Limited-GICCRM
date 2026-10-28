import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { CheckSquare, ChevronDown, Clock, Columns3, Filter, List, MessageSquare, Paperclip, Plus, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { TASK_PRIORITIES, TASK_STATUSES, optionById } from '../../lib/constants';
import { emit, TASKS_CHANGED, TIMERS_CHANGED } from '../../lib/events';
import { formatDate, formatDuration, isOverdue } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useEvent } from '../../hooks/useEvent';
import { useStaff } from '../../hooks/useStaff';
import { SummaryCard, AvatarStack, Button, Card, EmptyState, ErrorNote, Input, Menu, MenuItem, Pagination, Select, Spinner, StatusBadge, Tag } from '../ui';
import { useToast } from '../ui/Toast';
import type { Paginated, Task } from '../../types';
import { useTaskModals } from './TaskModalHost';
import SavedFilters, { type FilterValues } from '../filters/SavedFilters';
import { downloadCsv } from '../../pages/reports/shared';

type TaskList = Paginated<Task> & { meta: { status_counts: Record<string, number>; can_create: boolean; summary: Record<string, { total: number; mine: number }> } };

const DEFAULT_STATUSES = TASK_STATUSES.filter((s) => s.id !== 5).map((s) => s.id);

/**
 * Perfex tasks table and Kanban board, with the status summary, filters, row options (Start
 * Timer | Edit | Delete) and bulk actions. Used on the Tasks page and inside a project.
 */
export default function TasksBoard({ projectId, canCreate: canCreateOverride }: { projectId?: number; canCreate?: boolean }) {
    const toast = useToast();
    const staff = useStaff();
    const { openTask, newTask, editTask } = useTaskModals();
    const [view, setView] = useState<'list' | 'kanban'>('list');
    const [statuses, setStatuses] = useState<number[]>(DEFAULT_STATUSES);
    const [filter, setFilter] = useState('');
    const [assignee, setAssignee] = useState('');
    const [priority, setPriority] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [selected, setSelected] = useState<number[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [startFrom, setStartFrom] = useState('');
    const [startTo, setStartTo] = useState('');
    const savedFilterValues = { filter, assignee, priority, statuses, search, start_from: startFrom, start_to: startTo };
    const applySaved = (f: FilterValues) => {
        setFilter(String(f.filter ?? ''));
        setAssignee(String(f.assignee ?? ''));
        setPriority(String(f.priority ?? ''));
        setStatuses(Array.isArray(f.statuses) ? (f.statuses as number[]) : DEFAULT_STATUSES);
        setSearch(String(f.search ?? ''));
        setStartFrom(String(f.start_from ?? ''));
        setStartTo(String(f.start_to ?? ''));
        setPage(1);
        setView('list');
    };

    const params = useMemo(() => {
        const p: Record<string, unknown> = { search, project_id: projectId, sort: view === 'kanban' ? 'kanban_order' : 'id', direction: view === 'kanban' ? 'asc' : 'desc' };
        if (view === 'list') {
            p.status = statuses.length ? statuses : [0];
            p.page = page;
            p.per_page = perPage;
        } else {
            p.all = 1;
        }
        if (filter) {
            p[filter.startsWith('due:') ? 'due' : filter] = filter.startsWith('due:') ? filter.slice(4) : 1;
        }
        if (assignee) {
            p.assignee_id = assignee;
        }
        if (priority) {
            p.priority = [Number(priority)];
        }
        if (startFrom) {
            p.start_from = startFrom;
        }
        if (startTo) {
            p.start_to = startTo;
        }

        return p;
    }, [search, projectId, view, statuses, page, perPage, filter, assignee, priority, startFrom, startTo]);

    const { data, loading, error, reload, setData } = useApi<TaskList>('/tasks', params);
    useEvent([TASKS_CHANGED, TIMERS_CHANGED], reload);
    const canCreate = canCreateOverride ?? data?.meta.can_create ?? false;

    async function run(call: () => Promise<unknown>, message: string) {
        try {
            await call();
            toast(message);
            emit(TASKS_CHANGED);
            emit(TIMERS_CHANGED);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function bulk(action: string, extra: Record<string, unknown> = {}) {
        if (action === 'delete' && !confirm(`Delete ${selected.length} task(s)?`)) {
            return;
        }
        try {
            const { data: result } = await api.post<{ message: string }>('/tasks/bulk', { ids: selected, action, ...extra });
            toast(result.message);
            setSelected([]);
            emit(TASKS_CHANGED);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function exportCsv() {
        const { data: all } = await api.get<TaskList>('/tasks', { params: { ...params, all: 1, page: undefined, per_page: undefined } });
        const rows = all.data.map((t) => [
            t.id,
            t.name,
            relatedLabel(t) ?? '',
            optionById(TASK_STATUSES, t.status)?.name ?? '',
            t.start_date ?? '',
            t.due_date ?? '',
            (t.assignees ?? []).map((a) => a.full_name).join(', '),
            (t.tags ?? []).join(', '),
            optionById(TASK_PRIORITIES, t.priority)?.name ?? '',
        ]);
        downloadCsv('tasks', ['#', 'Name', 'Related To', 'Status', 'Start Date', 'Due Date', 'Assigned to', 'Tags', 'Priority'], rows);
    }

    const pickStatus = (id: number) => (setStatuses([id]), setPage(1), setView('list'));

    return (
        <div className="space-y-4">
            {data?.meta.summary && <TasksSummary summary={data.meta.summary} active={statuses} onPick={pickStatus} />}

            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => newTask({ project_id: projectId ?? null })}>
                        <Plus className="h-4 w-4" /> New Task
                    </Button>
                )}
                <button
                    type="button"
                    onClick={() => setView(view === 'list' ? 'kanban' : 'list')}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-2 text-gray-600 hover:bg-gray-50"
                    title={view === 'list' ? 'Switch to Kanban' : 'Switch to list'}
                >
                    {view === 'list' ? <Columns3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </button>
                <span className="ml-auto" />
                {!projectId && <SavedFilters identifier="tasks" current={savedFilterValues} onApply={applySaved} />}
                <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                    <Filter className="h-4 w-4" /> Filters
                </Button>
            </div>

            {showFilters && (
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <Select value={filter} onChange={(e) => (setFilter(e.target.value), setPage(1))} className="w-auto">
                                <option value="">All tasks</option>
                                <option value="my_tasks">My tasks</option>
                                <option value="following">Tasks I'm following</option>
                                <option value="not_assigned">Not assigned</option>
                                <option value="due:today">Due today</option>
                                <option value="due:overdue">Overdue</option>
                                <option value="due:upcoming">Upcoming</option>
                                <option value="recurring">Recurring</option>
                                <option value="billable">Billable</option>
                            </Select>
                            <Select value={assignee} onChange={(e) => (setAssignee(e.target.value), setPage(1))} className="w-auto">
                                <option value="">Any assignee</option>
                                {staff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.full_name}
                                    </option>
                                ))}
                            </Select>
                            <Select value={priority} onChange={(e) => (setPriority(e.target.value), setPage(1))} className="w-auto">
                                <option value="">Any priority</option>
                                {TASK_PRIORITIES.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </Select>
                            <label className="flex items-center gap-1.5 text-[13px] text-gray-600">
                                Start date
                                <Input type="date" value={startFrom} onChange={(e) => (setStartFrom(e.target.value), setPage(1))} className="w-auto" aria-label="Start date from" />
                                –
                                <Input type="date" value={startTo} onChange={(e) => (setStartTo(e.target.value), setPage(1))} className="w-auto" aria-label="Start date to" />
                            </label>
                            <button type="button" onClick={() => (setFilter(''), setAssignee(''), setPriority(''), setStatuses(DEFAULT_STATUSES), setStartFrom(''), setStartTo(''), setPage(1))} className="text-[13px] text-blue-600 hover:underline">
                                Clear filters
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {TASK_STATUSES.map((status) => {
                                const active = statuses.includes(status.id);

                                return (
                                    <button
                                        key={status.id}
                                        type="button"
                                        onClick={() => (setStatuses((s) => (active ? s.filter((id) => id !== status.id) : [...s, status.id])), setPage(1))}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${active ? 'bg-white shadow-sm' : 'border-transparent bg-gray-100 opacity-60'}`}
                                        style={active ? { borderColor: status.color, color: status.color } : undefined}
                                    >
                                        {status.name}
                                        <span className="rounded-full bg-gray-100 px-1.5 text-gray-600">{data?.meta.status_counts[status.id] ?? 0}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <ErrorNote message={error} />

            {view === 'kanban' ? (
                loading && !data ? (
                    <Spinner />
                ) : (
                    data && <Kanban tasks={data.data} onOpen={openTask} onMoved={(tasks) => setData({ ...data, data: tasks })} onAdd={canCreate ? (status) => newTask({ project_id: projectId ?? null, status }) : undefined} />
                )
            ) : (
                <Card className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
                        <Select value={String(perPage)} onChange={(e) => (setPerPage(Number(e.target.value)), setPage(1))} className="w-20">
                            {[10, 25, 50, 100].map((n) => (
                                <option key={n}>{n}</option>
                            ))}
                        </Select>
                        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-[13px] font-medium text-gray-700">
                            <button type="button" onClick={exportCsv} className="px-3 py-1.5 hover:bg-gray-50">
                                Export
                            </button>
                            <button type="button" onClick={() => setShowBulk(!showBulk)} className="border-l border-gray-300 px-3 py-1.5 hover:bg-gray-50">
                                Manipulation
                            </button>
                            <button type="button" onClick={reload} className="border-l border-gray-300 px-2.5 py-1.5 hover:bg-gray-50" title="Reload">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <div className="relative ml-auto w-full sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                        </div>
                    </div>

                    {showBulk && (
                        <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm">
                            <span className="font-medium text-blue-800">{selected.length ? `${selected.length} selected` : 'Select tasks with the checkboxes'}</span>
                            {selected.length > 0 && (
                                <>
                                    <Select className="w-auto" value="" onChange={(e) => e.target.value && bulk('status', { status: Number(e.target.value) })}>
                                        <option value="">Change status…</option>
                                        {TASK_STATUSES.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </Select>
                                    <Select className="w-auto" value="" onChange={(e) => e.target.value && bulk('priority', { priority: Number(e.target.value) })}>
                                        <option value="">Change priority…</option>
                                        {TASK_PRIORITIES.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </Select>
                                    <Select className="w-auto" value="" onChange={(e) => e.target.value && bulk('assign', { user_id: Number(e.target.value) })}>
                                        <option value="">Assign to…</option>
                                        {staff.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.full_name}
                                            </option>
                                        ))}
                                    </Select>
                                    <Button size="sm" variant="secondary" onClick={() => bulk('billable', { billable: true })}>
                                        Mark billable
                                    </Button>
                                    <Button size="sm" variant="danger" onClick={() => bulk('delete')}>
                                        Delete
                                    </Button>
                                    <button type="button" onClick={() => setSelected([])} className="ml-auto text-xs text-blue-700 hover:underline">
                                        Clear
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {loading && !data ? (
                        <Spinner />
                    ) : !data || data.data.length === 0 ? (
                        <EmptyState title="No tasks found" text="Change the filters, or create a new task." />
                    ) : (
                        <>
                            <div className="table-scroll overflow-x-auto">
                                <table className="table-perfex">
                                    <thead>
                                        <tr>
                                            <th className="w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={data.data.length > 0 && data.data.every((t) => selected.includes(t.id))}
                                                    onChange={(e) => setSelected(e.target.checked ? data.data.map((t) => t.id) : [])}
                                                />
                                            </th>
                                            <th>#</th>
                                            <th>Name</th>
                                            <th>Status</th>
                                            <th>Start Date</th>
                                            <th>Due Date</th>
                                            <th>Assigned to</th>
                                            <th>Tags</th>
                                            <th>Priority</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.data.map((task) => (
                                            <TaskRow
                                                key={task.id}
                                                task={task}
                                                showRelated={!projectId}
                                                selected={selected.includes(task.id)}
                                                onSelect={(on) => setSelected((s) => (on ? [...s, task.id] : s.filter((id) => id !== task.id)))}
                                                onOpen={() => openTask(task.id)}
                                                onEdit={() => editTask(task.id)}
                                                run={run}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="border-t border-gray-100 px-4 py-3">
                                <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                            </div>
                        </>
                    )}
                </Card>
            )}
        </div>
    );
}

/** Perfex tasks summary: one card per status with the total and "My Tasks". */
function TasksSummary({ summary, active, onPick }: { summary: TaskList['meta']['summary']; active: number[]; onPick: (id: number) => void }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {TASK_STATUSES.map((status) => (
                <SummaryCard
                    key={status.id}
                    label={status.name}
                    color={status.color}
                    value={summary[status.id]?.total ?? 0}
                    active={active.length === 1 && active[0] === status.id}
                    sub={
                        <>
                            My tasks: <span className="font-semibold text-slate-700">{summary[status.id]?.mine ?? 0}</span>
                        </>
                    }
                    onClick={() => onPick(status.id)}
                />
            ))}
        </div>
    );
}

const relatedLabel = (t: Task) => (t.project ? [`#${t.project.id}`, t.project.name, t.project.customer_name].filter(Boolean).join(' - ') : null);

function TaskRow({ task, showRelated, selected, onSelect, onOpen, onEdit, run }: { task: Task; showRelated: boolean; selected: boolean; onSelect: (on: boolean) => void; onOpen: () => void; onEdit: () => void; run: (call: () => Promise<unknown>, message: string) => void }) {
    const status = optionById(TASK_STATUSES, task.status);
    const priority = optionById(TASK_PRIORITIES, task.priority);
    const cannotStart = !task.can?.track_time ? 'Only task assignees can start a timer' : task.status === 5 ? 'Complete' : null;
    const related = showRelated ? relatedLabel(task) : null;

    return (
        <tr className="group">
            <td>
                <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
            </td>
            <td>
                <button type="button" onClick={onOpen} className="text-blue-600 hover:underline">
                    {task.id}
                </button>
            </td>
            <td className="min-w-[16rem]">
                <div className="flex items-start gap-1">
                    {task.my_running_timer_id && <Clock className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                    <button type="button" onClick={onOpen} className="max-w-md truncate text-left font-medium text-gray-800 hover:text-blue-600" title={task.name}>
                        {task.name}
                    </button>
                </div>
                {related && (
                    <Link to={`/projects/${task.project!.id}`} title="Related To" className="mt-1 block text-[13px] text-gray-600 hover:text-blue-600">
                        {related}
                    </Link>
                )}
                <TaskMeta task={task} />
                <div className="mt-1 text-xs opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    {task.my_running_timer_id ? (
                        <button type="button" onClick={() => run(() => api.post(`/timers/${task.my_running_timer_id}/stop`), 'Timer stopped.')} className="text-red-600 hover:underline">
                            Stop Timer
                        </button>
                    ) : cannotStart ? (
                        <span className="cursor-not-allowed text-gray-400" title={cannotStart}>
                            Start Timer
                        </span>
                    ) : (
                        <button type="button" onClick={() => run(() => api.post(`/tasks/${task.id}/timers/start`), 'Timer started.')} className="font-semibold text-emerald-600 hover:underline">
                            Start Timer
                        </button>
                    )}
                    {task.can?.update && (
                        <>
                            <span className="mx-1 text-gray-300">|</span>
                            <button type="button" onClick={onEdit} className="text-blue-600 hover:underline">
                                Edit
                            </button>
                        </>
                    )}
                    {task.can?.delete && (
                        <>
                            <span className="mx-1 text-gray-300">|</span>
                            <button type="button" onClick={() => confirm(`Delete task "${task.name}"?`) && run(() => api.delete(`/tasks/${task.id}`), 'Task deleted.')} className="text-red-600 hover:underline">
                                Delete
                            </button>
                        </>
                    )}
                </div>
            </td>
            <td>
                {task.can?.work ? (
                    <Menu
                        align="left"
                        trigger={(toggle) => (
                            <button
                                type="button"
                                onClick={toggle}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium"
                                style={{ color: status?.color, borderColor: `${status?.color}66`, background: `${status?.color}0d` }}
                            >
                                {status?.name}
                                <ChevronDown className="h-3 w-3" />
                            </button>
                        )}
                    >
                        {(close) =>
                            TASK_STATUSES.filter((s) => s.id !== task.status).map((s) => (
                                <MenuItem key={s.id} onClick={() => (close(), run(() => api.post(`/tasks/${task.id}/status`, { status: s.id }), `Task marked as ${s.name}.`))}>
                                    Mark as {s.name}
                                </MenuItem>
                            ))
                        }
                    </Menu>
                ) : (
                    <StatusBadge option={status} />
                )}
            </td>
            <td className="whitespace-nowrap">{formatDate(task.start_date)}</td>
            <td className={`whitespace-nowrap ${isOverdue(task.due_date, task.status) ? 'font-medium text-red-600' : ''}`}>{formatDate(task.due_date)}</td>
            <td>
                <AvatarStack people={task.assignees} />
            </td>
            <td>
                <div className="flex flex-wrap gap-1">{task.tags?.map((t) => <Tag key={t}>{t}</Tag>)}</div>
            </td>
            <td className="whitespace-nowrap" style={{ color: priority?.color }}>
                {priority?.name}
            </td>
        </tr>
    );
}

function TaskMeta({ task }: { task: Task }) {
    const items = [];
    if (task.checklist_total) {
        items.push(
            <span key="c" className="inline-flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                {task.checklist_finished}/{task.checklist_total}
            </span>,
        );
    }
    if (task.comments_count) {
        items.push(
            <span key="m" className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {task.comments_count}
            </span>,
        );
    }
    if (task.attachments_count) {
        items.push(
            <span key="a" className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {task.attachments_count}
            </span>,
        );
    }
    if (task.total_logged_seconds) {
        items.push(<span key="t">{formatDuration(task.total_logged_seconds)} h</span>);
    }

    return items.length ? <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">{items}</div> : null;
}

/**
 * Drag a card to another column to change its status; the column order is saved as kanban_order.
 */
function Kanban({ tasks, onOpen, onMoved, onAdd }: { tasks: Task[]; onOpen: (id: number) => void; onMoved: (tasks: Task[]) => void; onAdd?: (status: number) => void }) {
    const toast = useToast();
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);

    async function drop(e: DragEvent, status: number, beforeId: number | null) {
        e.preventDefault();
        setOver(null);
        const id = dragging;
        setDragging(null);
        if (!id) {
            return;
        }
        const moved = tasks.find((t) => t.id === id);
        if (!moved) {
            return;
        }
        const column = tasks.filter((t) => t.status === status && t.id !== id);
        const index = beforeId ? column.findIndex((t) => t.id === beforeId) : column.length;
        column.splice(index < 0 ? column.length : index, 0, { ...moved, status });
        const order = column.map((t) => t.id);
        onMoved([...tasks.filter((t) => t.status !== status && t.id !== id), ...column.map((t, i) => ({ ...t, kanban_order: i + 1 }))]);
        try {
            await api.post('/tasks/reorder', { status, order });
            emit(TASKS_CHANGED);
        } catch (err) {
            toast(errorMessage(err), 'error');
            emit(TASKS_CHANGED);
        }
    }

    return (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-4">
                {TASK_STATUSES.map((status) => {
                    const column = tasks.filter((t) => t.status === status.id).sort((a, b) => a.kanban_order - b.kanban_order);

                    return (
                        <div
                            key={status.id}
                            onDragOver={(e) => (e.preventDefault(), setOver(status.id))}
                            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
                            onDrop={(e) => drop(e, status.id, null)}
                            className={`kanban-col ${over === status.id ? 'is-over' : ''}`}
                        >
                            <div className="kanban-head" style={{ '--col': status.color } as CSSProperties}>
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                                <span className="truncate text-[13.5px] font-semibold text-slate-800">{status.name}</span>
                                <span className="kanban-count">{column.length}</span>
                            </div>
                            <div className="flex min-h-[6rem] flex-1 flex-col gap-2 p-2">
                                {column.map((task) => (
                                    <div
                                        key={task.id}
                                        draggable={task.can?.work !== false}
                                        onDragStart={() => setDragging(task.id)}
                                        onDrop={(e) => (e.stopPropagation(), drop(e, status.id, task.id))}
                                        onClick={() => onOpen(task.id)}
                                        className={`kanban-card ${dragging === task.id ? 'opacity-50' : ''}`}
                                    >
                                        <p className="text-[13.5px] font-semibold leading-snug text-slate-800">{task.name}</p>
                                        {task.project && <p className="mt-0.5 truncate text-xs text-slate-500">{task.project.name}</p>}
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <StatusBadge option={optionById(TASK_PRIORITIES, task.priority)} />
                                            {task.due_date && <span className={`text-xs ${isOverdue(task.due_date, task.status) ? 'font-medium text-red-600' : 'text-gray-500'}`}>{formatDate(task.due_date)}</span>}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between">
                                            <TaskMeta task={task} />
                                            <AvatarStack people={task.assignees} max={3} />
                                        </div>
                                    </div>
                                ))}
                                {onAdd && (
                                    <button type="button" onClick={() => onAdd(status.id)} className="rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-500 hover:bg-white hover:text-brand">
                                        <Plus className="mr-1 inline h-3.5 w-3.5" />
                                        Add task
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
