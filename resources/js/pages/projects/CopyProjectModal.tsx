import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { TASK_STATUSES } from '../../lib/constants';
import { todayIso } from '../../lib/format';
import { Button, Checkbox, Field, Input, Modal, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Project } from '../../types';

/** Perfex "Copy project": choose what to copy; dates move with the new start date. */
export default function CopyProjectModal({ open, project, onClose, onCopied }: { open: boolean; project: Project; onClose: () => void; onCopied: (project: Project) => void }) {
    const toast = useToast();
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        customer_id: '',
        start_date: todayIso(),
        deadline: '',
        copy_tasks: true,
        copy_task_assignees: true,
        copy_task_followers: true,
        copy_task_checklist: true,
        task_status: 1,
        copy_milestones: true,
        copy_members: true,
    });

    useEffect(() => {
        if (!open) {
            return;
        }
        setForm((f) => ({ ...f, name: `${project.name} (copy)`, customer_id: String(project.customer?.id ?? ''), start_date: todayIso(), deadline: '' }));
        setErrors({});
        api.get<{ data: { id: number; name: string }[] }>('/customers/options').then((r) => setCustomers(r.data.data));
    }, [open, project]);

    async function copy() {
        setSaving(true);
        try {
            const { data } = await api.post<{ data: Project }>(`/projects/${project.id}/copy`, { ...form, customer_id: Number(form.customer_id), deadline: form.deadline || null });
            toast('Project copied.');
            onCopied(data.data);
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Copy project"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={copy} loading={saving}>
                        Copy project
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project name" className="sm:col-span-2">
                    <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Customer" required error={errors.customer_id} className="sm:col-span-2">
                    <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
                        {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Start date" required error={errors.start_date}>
                    <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                </Field>
                <Field label="Deadline" error={errors.deadline}>
                    <Input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
                </Field>
                <div className="space-y-2 rounded-lg border border-gray-200 p-3 sm:col-span-2">
                    <Checkbox label="Tasks" checked={form.copy_tasks} onChange={(v) => set('copy_tasks', v)} />
                    {form.copy_tasks && (
                        <div className="ml-6 space-y-2">
                            <Checkbox label="Task assignees" checked={form.copy_task_assignees} onChange={(v) => set('copy_task_assignees', v)} />
                            <Checkbox label="Task followers" checked={form.copy_task_followers} onChange={(v) => set('copy_task_followers', v)} />
                            <Checkbox label="Task checklist items" checked={form.copy_task_checklist} onChange={(v) => set('copy_task_checklist', v)} />
                            <Field label="Status of the copied tasks">
                                <Select value={form.task_status} onChange={(e) => set('task_status', Number(e.target.value))}>
                                    {TASK_STATUSES.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                    )}
                    <Checkbox label="Milestones" checked={form.copy_milestones} onChange={(v) => set('copy_milestones', v)} />
                    <Checkbox label="Members" checked={form.copy_members} onChange={(v) => set('copy_members', v)} />
                </div>
            </div>
        </Modal>
    );
}
