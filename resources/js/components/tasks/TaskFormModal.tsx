import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, ListChecks, NotebookPen, Paperclip, Users } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { RECURRING_TYPES, TASK_PRIORITIES } from '../../lib/constants';
import { todayIso } from '../../lib/format';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, SectionHeading, Select, StaffMultiSelect, TagInput, Textarea } from '../ui';
import { useToast } from '../ui/Toast';
import type { Milestone, Task } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

export interface TaskDefaults {
    project_id?: number | null;
    milestone_id?: number | null;
    status?: number;
    /** A task created from a lead is related to it (Perfex "related to: lead"). */
    lead?: { id: number; name: string } | null;
    /** A task created from a customer, invoice, ticket … is related to it. */
    related?: { type: RelatedType; id: number; name: string } | null;
}

/** What a task can be related to (Perfex "Related to"), besides a project. */
export type RelatedType = 'lead' | 'customer' | 'invoice' | 'estimate' | 'proposal' | 'contract' | 'ticket' | 'expense';
export const RELATED_TYPES: { id: RelatedType; name: string }[] = [
    { id: 'lead', name: 'Lead' },
    { id: 'customer', name: 'Customer' },
    { id: 'invoice', name: 'Invoice' },
    { id: 'estimate', name: 'Estimate' },
    { id: 'proposal', name: 'Proposal' },
    { id: 'contract', name: 'Contract' },
    { id: 'ticket', name: 'Ticket' },
    { id: 'expense', name: 'Expense' },
];

/** Search and pick one record of a type (an invoice, a customer …) the person may open. */
function RecordPicker({ type, value, onChange, error }: { type: RelatedType; value: { id: number; name: string } | null; onChange: (v: { id: number; name: string } | null) => void; error?: string }) {
    const [search, setSearch] = useState('');
    const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (value) {
            return;
        }
        setLoading(true);
        const timer = setTimeout(() => {
            api.get<{ data: { id: number; name: string }[] }>('/tasks/relations', { params: { type, search } })
                .then((r) => setOptions(r.data.data))
                .catch(() => setOptions([]))
                .finally(() => setLoading(false));
        }, 250);

        return () => clearTimeout(timer);
    }, [type, search, value]);
    const label = RELATED_TYPES.find((t) => t.id === type)?.name ?? '';

    if (value) {
        return (
            <Field label={label} error={error}>
                <div className="flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-2 text-[13px] ring-1 ring-accent/20">
                    <span className="min-w-0 flex-1 truncate font-semibold text-brand">{value.name}</span>
                    <button type="button" onClick={() => onChange(null)} className="shrink-0 text-[12px] font-semibold text-slate-500 hover:text-red-600">
                        Change
                    </button>
                </div>
            </Field>
        );
    }

    return (
        <Field label={label} error={error}>
            <div>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}s…`} />
                <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white text-[13px]">
                    {loading && options.length === 0 && <li className="px-3 py-2 text-slate-400">Searching…</li>}
                    {!loading && options.length === 0 && <li className="px-3 py-2 text-slate-400">Nothing found.</li>}
                    {options.map((o) => (
                        <li key={o.id}>
                            <button type="button" onClick={() => onChange(o)} className="block w-full truncate px-3 py-1.5 text-left hover:bg-slate-50">
                                {o.name}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </Field>
    );
}

interface FormState {
    name: string;
    project_id: string;
    /** Related to: '' (nothing), 'project', or a record type with the chosen record. */
    rel_type: '' | 'project' | RelatedType;
    rel: { id: number; name: string } | null;
    milestone_id: string;
    date_finished: string;
    files: File[];
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

/** "2026-11-17T10:30:00Z" → "2026-11-17T16:00" for a datetime-local input (the browser's time). */
const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** What the task is related to: its project, its lead, or another record. */
function relatedOf(task: Task | null, defaults: TaskDefaults): Pick<FormState, 'rel_type' | 'rel'> {
    if (task) {
        if (task.project) {
            return { rel_type: 'project', rel: null };
        }
        if (task.lead) {
            return { rel_type: 'lead', rel: task.lead };
        }
        if (task.related) {
            return { rel_type: task.related.type as RelatedType, rel: { id: task.related.id, name: task.related.name } };
        }
        return { rel_type: '', rel: null };
    }
    if (defaults.project_id) {
        return { rel_type: 'project', rel: null };
    }
    if (defaults.lead) {
        return { rel_type: 'lead', rel: defaults.lead };
    }
    if (defaults.related) {
        return { rel_type: defaults.related.type, rel: { id: defaults.related.id, name: defaults.related.name } };
    }
    return { rel_type: '', rel: null };
}

function initial(task: Task | null, defaults: TaskDefaults): FormState {
    return {
        name: task?.name ?? '',
        project_id: String(task?.project?.id ?? defaults.project_id ?? ''),
        ...relatedOf(task, defaults),
        milestone_id: String(task?.milestone?.id ?? defaults.milestone_id ?? ''),
        date_finished: task?.date_finished ? toLocalInput(task.date_finished) : '',
        files: [],
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
            // Related to one thing: a project, a lead, or another record.
            project_id: form.rel_type === 'project' && form.project_id ? Number(form.project_id) : null,
            lead_id: form.rel_type === 'lead' ? (form.rel?.id ?? null) : null,
            rel_type: form.rel_type && form.rel_type !== 'project' && form.rel_type !== 'lead' && form.rel ? form.rel_type : null,
            rel_id: form.rel_type && form.rel_type !== 'project' && form.rel_type !== 'lead' ? (form.rel?.id ?? null) : null,
            milestone_id: form.rel_type === 'project' && form.project_id && form.milestone_id ? Number(form.milestone_id) : null,
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
        if (task && task.status === 5 && form.date_finished) {
            payload.date_finished = new Date(form.date_finished).toISOString();
        }
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
            // Files chosen while creating the task (Perfex "Attach files").
            if (!task && form.files.length > 0) {
                const body = new FormData();
                form.files.forEach((file) => body.append('files[]', file));
                await api.post(`/tasks/${data.data.id}/attachments`, body).catch((e) => toast(`Task saved, but the files were not attached: ${errorMessage(e)}`, 'error'));
            }
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
                    {form.rel_type === 'project' && form.project_id && <Checkbox label="Visible to customer" checked={form.visible_to_client} onChange={(v) => update('visible_to_client', v)} />}
                </div>
                {!task && (
                    <div className="sm:col-span-2">
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2.5 text-[13px] hover:bg-slate-50">
                            <Paperclip className="h-4 w-4 shrink-0 text-accent" />
                            <span className="min-w-0 flex-1 truncate text-slate-600">{form.files.length ? form.files.map((f) => f.name).join(', ') : 'Attach files (optional, up to 10)'}</span>
                            {form.files.length > 0 && (
                                <button type="button" onClick={(e) => (e.preventDefault(), update('files', []))} className="shrink-0 text-[12px] font-semibold text-slate-500 hover:text-red-600">
                                    Clear
                                </button>
                            )}
                            <input type="file" multiple className="hidden" onChange={(e) => update('files', Array.from(e.target.files ?? []).slice(0, 10))} />
                        </label>
                    </div>
                )}
                <SectionHeading icon={ListChecks} title="Task" hint="What needs doing, and how urgent it is." className="sm:col-span-2" />
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
                <SectionHeading icon={CalendarClock} title="Schedule" className="sm:col-span-2 mt-1 border-t border-slate-200/70 pt-4" />
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

                <SectionHeading icon={Users} title="Related to & people" className="sm:col-span-2 mt-1 border-t border-slate-200/70 pt-4" />
                <Field label="Related to" error={errors.rel_type}>
                    <Select value={form.rel_type} onChange={(e) => setForm((f) => ({ ...f, rel_type: e.target.value as FormState['rel_type'], rel: null, project_id: '', milestone_id: '' }))}>
                        <option value="">Nothing</option>
                        <option value="project">Project</option>
                        {RELATED_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                {form.rel_type === 'project' ? (
                    <Field label="Project" error={errors.project_id}>
                        <Select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, milestone_id: '' }))}>
                            <option value="">Choose a project</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                ) : form.rel_type ? (
                    <RecordPicker type={form.rel_type} value={form.rel} onChange={(rel) => update('rel', rel)} error={errors.rel_id ?? errors.lead_id} />
                ) : (
                    <div className="hidden sm:block" />
                )}
                {form.rel_type === 'project' && (
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
                )}
                {task && task.status === 5 && (
                    <Field label="Finished" error={errors.date_finished} hint="When the task was completed.">
                        <Input type="datetime-local" value={form.date_finished} onChange={(e) => update('date_finished', e.target.value)} />
                    </Field>
                )}

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

                <SectionHeading icon={NotebookPen} title="Details" className="sm:col-span-2 mt-1 border-t border-slate-200/70 pt-4" />
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
