import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { Columns3, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../../lib/api';
import { MILESTONE_COLORS, TASK_STATUSES, optionById } from '../../../lib/constants';
import { emit, TASKS_CHANGED } from '../../../lib/events';
import { formatDate, formatDuration, isOverdue, todayIso } from '../../../lib/format';
import { useApi } from '../../../hooks/useApi';
import { useEvent } from '../../../hooks/useEvent';
import { AvatarStack, Button, Card, EmptyState, Field, IconButton, Input, Modal, ProgressBar, Spinner, StatusBadge, Textarea } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { useTaskModals } from '../../../components/tasks/TaskModalHost';
import type { Milestone, Project, Task } from '../../../types';

export default function MilestonesTab({ project }: { project: Project }) {
    const toast = useToast();
    const { openTask, newTask } = useTaskModals();
    const [view, setView] = useState<'list' | 'board'>('list');
    const [editing, setEditing] = useState<Milestone | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const milestones = useApi<{ data: Milestone[] }>(`/projects/${project.id}/milestones`);
    const tasks = useApi<{ data: Task[] }>(view === 'board' ? '/tasks' : null, { project_id: project.id, all: 1, sort: 'milestone_order', direction: 'asc' });
    useEvent([TASKS_CHANGED], () => {
        milestones.reload();
        if (view === 'board') {
            tasks.reload();
        }
    });

    async function remove(milestone: Milestone) {
        if (!confirm(`Delete milestone "${milestone.name}"? Its tasks stay, without a milestone.`)) {
            return;
        }
        try {
            await api.delete(`/milestones/${milestone.id}`);
            toast('Milestone deleted.');
            emit(TASKS_CHANGED);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const list = milestones.data?.data ?? [];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                {project.can.update && (
                    <Button onClick={() => (setEditing(null), setFormOpen(true))}>
                        <Plus className="h-4 w-4" /> New milestone
                    </Button>
                )}
                <div className="flex rounded-lg border border-gray-300 bg-white p-0.5">
                    <button type="button" onClick={() => setView('list')} className={`rounded-md px-2.5 py-1.5 ${view === 'list' ? 'bg-gray-100' : 'text-gray-500'}`} title="List">
                        <List className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setView('board')} className={`rounded-md px-2.5 py-1.5 ${view === 'board' ? 'bg-gray-100' : 'text-gray-500'}`} title="Board">
                        <Columns3 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {!milestones.data ? (
                <Spinner />
            ) : view === 'list' ? (
                list.length === 0 ? (
                    <EmptyState title="No milestones yet" text="Milestones group the project's tasks into phases." />
                ) : (
                    <Card className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Start date</th>
                                        <th className="px-4 py-3">Due date</th>
                                        <th className="px-4 py-3">Tasks</th>
                                        <th className="px-4 py-3">Logged time</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {list.map((m) => (
                                        <tr key={m.id}>
                                            <td className="px-4 py-3">
                                                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color ?? '#64748b' }} />
                                                <span className="font-medium">{m.name}</span>
                                                {m.description && <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(m.start_date)}</td>
                                            <td className={`whitespace-nowrap px-4 py-3 ${isOverdue(m.due_date, m.tasks_total && m.tasks_total === m.tasks_finished ? 5 : 1) ? 'text-red-600' : 'text-gray-600'}`}>{formatDate(m.due_date)}</td>
                                            <td className="w-48 px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <ProgressBar value={m.tasks_total ? ((m.tasks_finished ?? 0) / m.tasks_total) * 100 : 0} color={m.color ?? undefined} />
                                                    <span className="whitespace-nowrap text-xs text-gray-500">
                                                        {m.tasks_finished}/{m.tasks_total}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">{formatDuration(m.logged_seconds)} h</td>
                                            <td className="px-4 py-3">
                                                {project.can.update && (
                                                    <div className="flex justify-end gap-1">
                                                        <IconButton label="Edit" onClick={() => (setEditing(m), setFormOpen(true))}>
                                                            <Pencil className="h-4 w-4" />
                                                        </IconButton>
                                                        <IconButton label="Delete" onClick={() => remove(m)} className="hover:text-red-600">
                                                            <Trash2 className="h-4 w-4" />
                                                        </IconButton>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )
            ) : !tasks.data ? (
                <Spinner />
            ) : (
                <MilestoneBoard
                    project={project}
                    milestones={list}
                    tasks={tasks.data.data}
                    onOpen={openTask}
                    onAdd={(milestoneId) => newTask({ project_id: project.id, milestone_id: milestoneId })}
                    onChanged={(next) => tasks.setData({ data: next })}
                />
            )}

            <MilestoneFormModal open={formOpen} project={project} milestone={editing} onClose={() => setFormOpen(false)} />
        </div>
    );
}

/** Perfex milestones board: a column per milestone; drag tasks between them. */
function MilestoneBoard({
    project,
    milestones,
    tasks,
    onOpen,
    onAdd,
    onChanged,
}: {
    project: Project;
    milestones: Milestone[];
    tasks: Task[];
    onOpen: (id: number) => void;
    onAdd: (milestoneId: number | null) => void;
    onChanged: (tasks: Task[]) => void;
}) {
    const toast = useToast();
    const [dragging, setDragging] = useState<number | null>(null);
    const columns = useMemo(() => [{ id: null as number | null, name: 'Uncategorized', color: '#94a3b8' }, ...milestones.map((m) => ({ id: m.id as number | null, name: m.name, color: m.color ?? '#64748b' }))], [milestones]);

    async function drop(e: DragEvent, milestoneId: number | null) {
        e.preventDefault();
        const id = dragging;
        setDragging(null);
        if (!id || !project.can.update) {
            return;
        }
        const moved = tasks.find((t) => t.id === id);
        if (!moved) {
            return;
        }
        const column = [...tasks.filter((t) => (t.milestone?.id ?? null) === milestoneId && t.id !== id), moved];
        const milestone = milestones.find((m) => m.id === milestoneId);
        onChanged(tasks.map((t) => (t.id === id ? { ...t, milestone: milestone ? { id: milestone.id, name: milestone.name, color: milestone.color } : null } : t)));
        try {
            await api.post(`/projects/${project.id}/milestones/reorder`, { tasks: [{ milestone_id: milestoneId, order: column.map((t) => t.id) }] });
            emit(TASKS_CHANGED);
        } catch (err) {
            toast(errorMessage(err), 'error');
        }
    }

    return (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-4">
                {columns.map((col) => {
                    const colTasks = tasks.filter((t) => (t.milestone?.id ?? null) === col.id);

                    return (
                        <div key={col.id ?? 'none'} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, col.id)} className="kanban-col">
                            <div className="kanban-head" style={{ '--col': col.color } as CSSProperties}>
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: col.color }} />
                                <span className="truncate text-[13.5px] font-semibold text-slate-800">{col.name}</span>
                                <span className="kanban-count">{colTasks.length}</span>
                            </div>
                            <div className="flex min-h-[6rem] flex-col gap-2 p-2">
                                {colTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        draggable={project.can.update}
                                        onDragStart={() => setDragging(task.id)}
                                        onClick={() => onOpen(task.id)}
                                        className="kanban-card"
                                    >
                                        <p className="text-[13.5px] font-semibold text-slate-800">{task.name}</p>
                                        <div className="mt-2 flex items-center justify-between">
                                            <StatusBadge option={optionById(TASK_STATUSES, task.status)} />
                                            <AvatarStack people={task.assignees} max={3} />
                                        </div>
                                    </div>
                                ))}
                                {project.can.create_tasks && (
                                    <button type="button" onClick={() => onAdd(col.id)} className="rounded-lg px-2 py-1.5 text-left text-xs font-medium text-gray-500 hover:bg-white">
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

function MilestoneFormModal({ open, project, milestone, onClose }: { open: boolean; project: Project; milestone: Milestone | null; onClose: () => void }) {
    const toast = useToast();
    const [form, setForm] = useState({ name: '', description: '', start_date: '', due_date: '', color: MILESTONE_COLORS[0] });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setForm({
                name: milestone?.name ?? '',
                description: milestone?.description ?? '',
                start_date: milestone?.start_date ?? todayIso(),
                due_date: milestone?.due_date ?? project.deadline ?? todayIso(),
                color: milestone?.color ?? MILESTONE_COLORS[0],
            });
            setErrors({});
        }
    }, [open, milestone, project.deadline]);

    async function save() {
        setSaving(true);
        try {
            if (milestone) {
                await api.put(`/milestones/${milestone.id}`, form);
            } else {
                await api.post(`/projects/${project.id}/milestones`, form);
            }
            toast(milestone ? 'Milestone updated.' : 'Milestone created.');
            emit(TASKS_CHANGED);
            onClose();
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={milestone ? 'Edit milestone' : 'New milestone'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" required error={errors.name} className="sm:col-span-2">
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </Field>
                <Field label="Start date" error={errors.start_date}>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </Field>
                <Field label="Due date" required error={errors.due_date}>
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </Field>
                <Field label="Color" className="sm:col-span-2">
                    <div className="flex flex-wrap gap-2">
                        {MILESTONE_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => setForm({ ...form, color })}
                                className={`h-7 w-7 rounded-full ring-offset-2 ${form.color === color ? 'ring-2 ring-gray-800' : ''}`}
                                style={{ backgroundColor: color }}
                                aria-label={color}
                            />
                        ))}
                    </div>
                </Field>
                <Field label="Description" className="sm:col-span-2">
                    <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
            </div>
        </Modal>
    );
}
