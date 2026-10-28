import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { RECURRING_TYPES, TASK_PRIORITIES } from '../../lib/constants';
import { todayIso } from '../../lib/format';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Select, StaffMultiSelect, TagInput, Textarea } from '../ui';
import { useToast } from '../ui/Toast';
import type { Milestone, Task } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

export interface TaskDefaults {
    project_id?: number | null;
    milestone_id?: number | null;
    status?: number;
}

interface FormState {
    name: string;
    project_id: string;
    milestone_id: string;
    priority: number;
    start_date: string;
    due_date: string;
    is_public: boolean;
    visible_to_client: boolean;
    billable: boolean;
    hourly_rate: string;
    repeat_every: string;
    recurring_type: string;
    cycles: string;
    infinity: boolean;
    assignees: number[];
    followers: number[];
    tags: string[];
    checklist_templates: number[];
    description: string;
}

function initial(task: Task | null, defaults: TaskDefaults): FormState {
    return {
        name: task?.name ?? '',
        project_id: String(task?.project?.id ?? defaults.project_id ?? ''),
        milestone_id: String(task?.milestone?.id ?? defaults.milestone_id ?? ''),
        priority: task?.priority ?? 2,
        start_date: task?.start_date ?? todayIso(),
        due_date: task?.due_date ?? '',
        is_public: task?.is_public ?? false,
        visible_to_client: task?.visible_to_client ?? false,
        billable: task?.billable ?? true,
        hourly_rate: task?.hourly_rate ?? '0',
        repeat_every: task?.repeat_every ? String(task.repeat_every) : '',
        recurring_type: task?.recurring_type ?? 'week',
        cycles: task?.cycles ? String(task.cycles) : '',
        infinity: !task?.cycles,
        assignees: [],
        followers: [],
        tags: task?.tags ?? [],
        checklist_templates: [],
        description: task?.description ?? '',
    };
}

export default function TaskFormModal({
    open,
    task,
    defaults = {},
    onClose,
    onSaved,
}: {
    open: boolean;
    task: Task | null;
    defaults?: TaskDefaults;
    onClose: () => void;
    onSaved: (task: Task) => void;
}) {
    const toast = useToast();
    const staff = useStaff();
    const [form, setForm] = useState<FormState>(() => initial(task, defaults));
    const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [templates, setTemplates] = useState<{ id: number; description: string }[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('tasks', task?.id);
    const defaultsKey = JSON.stringify(defaults);

    useEffect(() => {
        if (!open) {
            return;
        }
        setForm(initial(task, JSON.parse(defaultsKey)));
        setErrors({});
        setError(null);
        api.get<{ data: { id: number; name: string }[] }>('/projects', { params: { status: [1, 2, 3, 4, 5], per_page: 200, sort: 'name', direction: 'asc' } })
            .then((r) => setProjects(r.data.data))
            .catch(() => setProjects([]));
        api.get<{ data: { id: number; description: string }[] }>('/checklist-templates')
            .then((r) => setTemplates(r.data.data))
            .catch(() => setTemplates([]));
    }, [open, task, defaultsKey]);

    useEffect(() => {
        if (!open || !form.project_id) {
            setMilestones([]);
            return;
        }
        api.get<{ data: Milestone[] }>(`/projects/${form.project_id}/milestones`)
            .then((r) => setMilestones(r.data.data))
            .catch(() => setMilestones([]));
    }, [open, form.project_id]);

    const update = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((f) => ({ ...f, [field]: value }));

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        setError(null);
        const payload: Record<string, unknown> = {
            name: form.name,
            project_id: form.project_id ? Number(form.project_id) : null,
            milestone_id: form.project_id && form.milestone_id ? Number(form.milestone_id) : null,
            priority: form.priority,
            start_date: form.start_date,
            due_date: form.due_date || null,
            is_public: form.is_public,
            visible_to_client: form.visible_to_client,
            billable: form.billable,
            hourly_rate: form.hourly_rate || 0,
            repeat_every: form.repeat_every ? Number(form.repeat_every) : null,
            recurring_type: form.repeat_every ? form.recurring_type : null,
            cycles: form.repeat_every && !form.infinity ? Number(form.cycles || 0) : 0,
            tags: form.tags,
            checklist_templates: form.checklist_templates,
            description: form.description,
        };
        if (!task) {
            payload.assignees = form.assignees;
            payload.followers = form.followers;
            if (defaults.status) {
                payload.status = defaults.status;
            }
        }
        try {
            const { data } = task ? await api.put<{ data: Task }>(`/tasks/${task.id}`, payload) : await api.post<{ data: Task }>('/tasks', payload);
            await cf.save(data.data.id);
            toast(task ? 'Task updated.' : 'Task created.');
            onSaved(data.data);
        } catch (err) {
            const fields = fieldErrors(err);
            setErrors(fields);
            setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={task ? 'Edit task' : 'Add new task'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="task-form" loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <form id="task-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <ErrorNote message={error} />
                </div>
                <div className="flex flex-wrap gap-5 sm:col-span-2">
                    <Checkbox label="Public (visible to all staff)" checked={form.is_public} onChange={(v) => update('is_public', v)} />
                    <Checkbox label="Billable" checked={form.billable} onChange={(v) => update('billable', v)} />
                    {form.project_id && <Checkbox label="Visible to customer" checked={form.visible_to_client} onChange={(v) => update('visible_to_client', v)} />}
                </div>
                <Field label="Subject" required error={errors.name} className="sm:col-span-2">
                    <Input value={form.name} onChange={(e) => update('name', e.target.value)} autoFocus />
                </Field>
                <Field label="Hourly rate" error={errors.hourly_rate}>
                    <Input type="number" min={0} step="0.01" value={form.hourly_rate} onChange={(e) => update('hourly_rate', e.target.value)} />
                </Field>
                <Field label="Priority" required error={errors.priority}>
                    <Select value={form.priority} onChange={(e) => update('priority', Number(e.target.value))}>
                        {TASK_PRIORITIES.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Start date" required error={errors.start_date}>
                    <Input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
                </Field>
                <Field label="Due date" error={errors.due_date}>
                    <Input type="date" value={form.due_date} min={form.start_date} onChange={(e) => update('due_date', e.target.value)} />
                </Field>

                <Field label="Repeat every" error={errors.repeat_every}>
                    <div className="flex gap-2">
                        <Input type="number" min={1} placeholder="Never" value={form.repeat_every} onChange={(e) => update('repeat_every', e.target.value)} className="w-24" />
                        <Select value={form.recurring_type} onChange={(e) => update('recurring_type', e.target.value)} disabled={!form.repeat_every}>
                            {RECURRING_TYPES.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                </Field>
                {form.repeat_every ? (
                    <Field label="Total cycles" error={errors.cycles}>
                        <div className="flex items-center gap-3">
                            <Input type="number" min={1} value={form.cycles} disabled={form.infinity} onChange={(e) => update('cycles', e.target.value)} className="w-24" />
                            <Checkbox label="Infinity" checked={form.infinity} onChange={(v) => update('infinity', v)} />
                        </div>
                    </Field>
                ) : (
                    <div className="hidden sm:block" />
                )}

                <Field label="Related to project" error={errors.project_id}>
                    <Select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, milestone_id: '' }))}>
                        <option value="">Not related to a project</option>
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Milestone" error={errors.milestone_id}>
                    <Select value={form.milestone_id} onChange={(e) => update('milestone_id', e.target.value)} disabled={!form.project_id}>
                        <option value="">No milestone</option>
                        {milestones.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                {!task && (
                    <>
                        <Field label="Assignees" error={errors.assignees}>
                            <StaffMultiSelect staff={staff} value={form.assignees} onChange={(ids) => update('assignees', ids)} />
                        </Field>
                        <Field label="Followers" error={errors.followers}>
                            <StaffMultiSelect staff={staff} value={form.followers} onChange={(ids) => update('followers', ids)} />
                        </Field>
                    </>
                )}

                {templates.length > 0 && (
                    <Field label="Insert checklist templates" className="sm:col-span-2">
                        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-gray-200 p-3">
                            {templates.map((t) => (
                                <Checkbox
                                    key={t.id}
                                    label={t.description}
                                    checked={form.checklist_templates.includes(t.id)}
                                    onChange={(on) => update('checklist_templates', on ? [...form.checklist_templates, t.id] : form.checklist_templates.filter((id) => id !== t.id))}
                                />
                            ))}
                        </div>
                    </Field>
                )}

                <Field label="Tags" className="sm:col-span-2">
                    <TagInput value={form.tags} onChange={(tags) => update('tags', tags)} />
                </Field>
                <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                <Field label="Task description" error={errors.description} className="sm:col-span-2">
                    <Textarea rows={5} value={form.description} onChange={(e) => update('description', e.target.value)} />
                </Field>
            </form>
        </Modal>
    );
}
