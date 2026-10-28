import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { BILLING_TYPES, PROJECT_STATUSES } from '../../lib/constants';
import { todayIso } from '../../lib/format';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Select, StaffMultiSelect, TagInput, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Project } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';

interface FormState {
    name: string;
    customer_id: string;
    status: number;
    billing_type: number;
    project_cost: string;
    project_rate_per_hour: string;
    estimated_hours: string;
    start_date: string;
    deadline: string;
    progress_from_tasks: boolean;
    progress: number;
    members: number[];
    tags: string[];
    customer_settings: Record<string, boolean>;
    description: string;
    workspace_link: string;
    mark_all_tasks_complete: boolean;
}

/** Perfex project settings for the customers area: [key, label, default]. */
const CUSTOMER_SETTINGS: [string, string, boolean][] = [
    ['view_tasks', 'Allow customer to view tasks', true],
    ['comment_on_tasks', 'Allow customer to comment on project tasks', true],
    ['view_task_comments', 'Allow customer to view task comments', true],
    ['view_task_checklist_items', 'Allow customer to view task checklist items', true],
    ['view_task_total_logged_time', 'Allow customer to view task total logged time', true],
    ['view_milestones', 'Allow customer to view milestones', true],
    ['view_timesheets', 'Allow customer to view timesheets', true],
    ['view_team_members', 'Allow customer to view team members', true],
];

function initialState(project: Project | null): FormState {
    return {
        name: project?.name ?? '',
        customer_id: project?.customer ? String(project.customer.id) : '',
        status: project?.status ?? 2,
        billing_type: project?.billing_type ?? 1,
        project_cost: project?.project_cost ?? '',
        project_rate_per_hour: project?.project_rate_per_hour ?? '',
        estimated_hours: project?.estimated_hours ?? '',
        start_date: project?.start_date ?? todayIso(),
        deadline: project?.deadline ?? '',
        progress_from_tasks: project?.progress_from_tasks ?? true,
        progress: project?.progress ?? 0,
        members: project?.members?.map((m) => m.id) ?? [],
        tags: project?.tags ?? [],
        customer_settings: project?.customer_settings ?? Object.fromEntries(CUSTOMER_SETTINGS.map(([k, , d]) => [k, d])),
        description: project?.description ?? '',
        workspace_link: project?.workspace_link ?? '',
        mark_all_tasks_complete: false,
    };
}

export default function ProjectFormModal({ open, project, onClose, onSaved }: { open: boolean; project: Project | null; onClose: () => void; onSaved: (project: Project) => void }) {
    const toast = useToast();
    const staff = useStaff();
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [form, setForm] = useState<FormState>(() => initialState(project));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('projects', project?.id);

    useEffect(() => {
        if (!open) {
            return;
        }
        setForm(initialState(project));
        setErrors({});
        setError(null);
        api.get<{ data: { id: number; name: string }[] }>('/customers/options')
            .then((r) => setCustomers(r.data.data))
            .catch(() => setCustomers([]));
    }, [open, project]);

    const update = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((f) => ({ ...f, [field]: value }));

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        setErrors({});
        setError(null);
        const payload = {
            ...form,
            customer_id: form.customer_id ? Number(form.customer_id) : null,
            project_cost: form.project_cost === '' ? null : form.project_cost,
            project_rate_per_hour: form.project_rate_per_hour === '' ? null : form.project_rate_per_hour,
            estimated_hours: form.estimated_hours === '' ? null : form.estimated_hours,
            deadline: form.deadline || null,
        };
        try {
            const { data } = project ? await api.put<{ data: Project }>(`/projects/${project.id}`, payload) : await api.post<{ data: Project }>('/projects', payload);
            await cf.save(data.data.id);
            toast(project ? 'Project updated.' : 'Project created.');
            onSaved(data.data);
        } catch (err) {
            const fields = fieldErrors(err);
            setErrors(fields);
            setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    const finishing = project && form.status === 4 && project.status !== 4;

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={project ? `Edit project: ${project.name}` : 'New project'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="project-form" loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <form id="project-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <ErrorNote message={error} />
                </div>
                <Field label="Project name" required error={errors.name} className="sm:col-span-2">
                    <Input value={form.name} onChange={(e) => update('name', e.target.value)} autoFocus />
                </Field>
                <Field label="Customer" required error={errors.customer_id} hint={customers.length === 0 ? 'Add a customer first (Customers page).' : undefined}>
                    <Select value={form.customer_id} onChange={(e) => update('customer_id', e.target.value)}>
                        <option value="">Select customer</option>
                        {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Status" required error={errors.status}>
                    <Select value={form.status} onChange={(e) => update('status', Number(e.target.value))}>
                        {PROJECT_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <div className="space-y-2 sm:col-span-2">
                    <Checkbox label="Calculate progress through tasks" checked={form.progress_from_tasks} onChange={(v) => update('progress_from_tasks', v)} />
                    {!form.progress_from_tasks && (
                        <div className="flex items-center gap-3">
                            <input type="range" min={0} max={100} value={form.progress} onChange={(e) => update('progress', Number(e.target.value))} className="w-full accent-blue-600" />
                            <span className="w-12 text-right text-sm font-medium">{form.progress}%</span>
                        </div>
                    )}
                </div>

                <Field label="Billing type" required error={errors.billing_type}>
                    <Select value={form.billing_type} onChange={(e) => update('billing_type', Number(e.target.value))}>
                        {BILLING_TYPES.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                {form.billing_type === 1 && (
                    <Field label="Total rate" required error={errors.project_cost}>
                        <Input type="number" min={0} step="0.01" value={form.project_cost} onChange={(e) => update('project_cost', e.target.value)} />
                    </Field>
                )}
                {form.billing_type === 2 && (
                    <Field label="Rate per hour" required error={errors.project_rate_per_hour}>
                        <Input type="number" min={0} step="0.01" value={form.project_rate_per_hour} onChange={(e) => update('project_rate_per_hour', e.target.value)} />
                    </Field>
                )}
                {form.billing_type === 3 && <div className="hidden sm:block" />}

                <Field label="Estimated hours" error={errors.estimated_hours}>
                    <Input type="number" min={0} step="0.25" value={form.estimated_hours} onChange={(e) => update('estimated_hours', e.target.value)} />
                </Field>
                <Field label="Members" error={errors.members}>
                    <StaffMultiSelect staff={staff} value={form.members} onChange={(ids) => update('members', ids)} />
                </Field>
                <Field label="Start date" required error={errors.start_date}>
                    <Input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
                </Field>
                <Field label="Deadline" error={errors.deadline}>
                    <Input type="date" value={form.deadline} min={form.start_date} onChange={(e) => update('deadline', e.target.value)} />
                </Field>
                <Field label="Tags" className="sm:col-span-2">
                    <TagInput value={form.tags} onChange={(tags) => update('tags', tags)} />
                </Field>
                <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                <details className="rounded-md border border-gray-200 px-3 py-2 sm:col-span-2">
                    <summary className="cursor-pointer text-[13.5px] font-medium text-gray-700">Customer settings (what the customer sees in the customers area)</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {CUSTOMER_SETTINGS.map(([key, label]) => (
                            <Checkbox key={key} label={label} checked={!!form.customer_settings[key]} onChange={(v) => update('customer_settings', { ...form.customer_settings, [key]: v })} />
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Only tasks marked "Visible to customer" are shown.</p>
                </details>
                <Field label="Workspace Link" error={errors.workspace_link} hint="e.g. the project's Google Chat room (https://…)" className="sm:col-span-2">
                    <Input type="url" value={form.workspace_link} onChange={(e) => update('workspace_link', e.target.value)} placeholder="https://chat.google.com/room/…" />
                </Field>
                <Field label="Description" error={errors.description} className="sm:col-span-2">
                    <Textarea rows={5} value={form.description} onChange={(e) => update('description', e.target.value)} />
                </Field>
                {finishing && (
                    <div className="sm:col-span-2">
                        <Checkbox label="Mark all tasks as complete" checked={form.mark_all_tasks_complete} onChange={(v) => update('mark_all_tasks_complete', v)} />
                    </div>
                )}
            </form>
        </Modal>
    );
}
