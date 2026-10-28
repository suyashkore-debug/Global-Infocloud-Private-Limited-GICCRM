import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { formatDate, todayIso } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, EmptyState, ErrorNote, Field, IconButton, Input, Modal, ProgressBar, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface Goal {
    id: number;
    subject: string;
    description: string | null;
    goal_type: number;
    type_name: string;
    achievement: string;
    start_date: string;
    end_date: string;
    staff_id: number | null;
    staff: string | null;
    contract_type_id: number | null;
    contract_type: string | null;
    notify_when_fail: boolean;
    notify_when_achieve: boolean;
    progress: { total: number; percent: number };
}

const MONEY_TYPES = [1, 8];

/** Utilities → Goals with live progress, as Perfex's goals module. */
export default function GoalsPage() {
    const toast = useToast();
    const staff = useStaff();
    const canCreate = usePermission('goals.create');
    const canEdit = usePermission('goals.edit');
    const canDelete = usePermission('goals.delete');
    const { data, error, reload } = useApi<{ data: Goal[]; meta: { types: { id: number; name: string }[] } }>('/goals');
    const [contractTypes, setContractTypes] = useState<{ id: number; name: string }[]>([]);
    const [editing, setEditing] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
    const blank = { subject: '', description: '', goal_type: '1', achievement: '', start_date: todayIso(), end_date: '', staff_id: '', contract_type_id: '', notify_when_fail: true, notify_when_achieve: true };
    const [form, setForm] = useState(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        api.get<{ data: { id: number; name: string }[] }>('/setup/contract-types').then((r) => setContractTypes(r.data.data));
    }, []);

    function start(goal: Goal | null) {
        setForm(
            goal
                ? { subject: goal.subject, description: goal.description ?? '', goal_type: String(goal.goal_type), achievement: goal.achievement, start_date: goal.start_date, end_date: goal.end_date, staff_id: String(goal.staff_id ?? ''), contract_type_id: String(goal.contract_type_id ?? ''), notify_when_fail: goal.notify_when_fail, notify_when_achieve: goal.notify_when_achieve }
                : blank,
        );
        setErrors({});
        setEditing({ open: true, goal });
    }

    async function save() {
        const payload = { ...form, goal_type: Number(form.goal_type), staff_id: form.staff_id ? Number(form.staff_id) : null, contract_type_id: form.contract_type_id ? Number(form.contract_type_id) : null };
        try {
            if (editing.goal) {
                await api.put(`/goals/${editing.goal.id}`, payload);
            } else {
                await api.post('/goals', payload);
            }
            toast('Goal saved.');
            setEditing({ open: false, goal: null });
            reload();
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        }
    }

    const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Goals</h4>
            {canCreate && (
                <Button onClick={() => start(null)}>
                    <Plus className="h-4 w-4" /> New Goal
                </Button>
            )}
            <ErrorNote message={error} />
            {!data && !error ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState title="No goals yet" />
            ) : (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Staff Member</th>
                                <th>Achievement</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Goal Type</th>
                                <th className="w-56">Progress</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((g) => {
                                const isMoney = MONEY_TYPES.includes(g.goal_type);

                                return (
                                    <tr key={g.id}>
                                        <td className="font-medium">{g.subject}</td>
                                        <td>{g.staff ?? 'Everyone'}</td>
                                        <td>{isMoney ? money(g.achievement) : Number(g.achievement)}</td>
                                        <td className="whitespace-nowrap">{formatDate(g.start_date)}</td>
                                        <td className="whitespace-nowrap">{formatDate(g.end_date)}</td>
                                        <td>
                                            {g.type_name}
                                            {g.contract_type && <span className="block text-xs text-gray-500">{g.contract_type}</span>}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <ProgressBar value={g.progress.percent} color={g.progress.percent >= 100 ? '#16a34a' : '#2563eb'} />
                                                <span className="whitespace-nowrap text-xs text-gray-600">{g.progress.percent}%</span>
                                            </div>
                                            <span className="text-xs text-gray-500">{isMoney ? money(g.progress.total) : g.progress.total} achieved</span>
                                        </td>
                                        <td>
                                            <div className="flex justify-end gap-1">
                                                {canEdit && (
                                                    <IconButton label="Edit" onClick={() => start(g)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </IconButton>
                                                )}
                                                {canDelete && (
                                                    <IconButton label="Delete" onClick={() => confirm('Delete this goal?') && api.delete(`/goals/${g.id}`).then(reload)} className="hover:text-red-600">
                                                        <Trash2 className="h-4 w-4" />
                                                    </IconButton>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <Modal
                open={editing.open}
                onClose={() => setEditing({ open: false, goal: null })}
                title={editing.goal ? 'Edit Goal' : 'New Goal'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing({ open: false, goal: null })}>
                            Close
                        </Button>
                        <Button onClick={save}>Save</Button>
                    </>
                }
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Subject" required error={errors.subject} className="sm:col-span-2">
                        <Input value={form.subject} onChange={set('subject')} />
                    </Field>
                    <Field label="Goal Type" required error={errors.goal_type} className="sm:col-span-2">
                        <Select value={form.goal_type} onChange={set('goal_type')}>
                            {data?.meta.types.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    {['5', '7'].includes(form.goal_type) && (
                        <Field label="Contract Type" required error={errors.contract_type_id} className="sm:col-span-2">
                            <Select value={form.contract_type_id} onChange={set('contract_type_id')}>
                                <option value="">Select</option>
                                {contractTypes.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}
                    <Field label="Staff Member" hint="Leave empty for the whole company.">
                        <Select value={form.staff_id} onChange={set('staff_id')}>
                            <option value="">Everyone</option>
                            {staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.full_name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Achievement" required error={errors.achievement}>
                        <Input type="number" step="any" value={form.achievement} onChange={set('achievement')} />
                    </Field>
                    <Field label="Start Date" required error={errors.start_date}>
                        <Input type="date" value={form.start_date} onChange={set('start_date')} />
                    </Field>
                    <Field label="End Date" required error={errors.end_date}>
                        <Input type="date" value={form.end_date} onChange={set('end_date')} />
                    </Field>
                    <Field label="Description" className="sm:col-span-2">
                        <Textarea rows={3} value={form.description} onChange={set('description')} />
                    </Field>
                    <Checkbox label="Notify staff members when goal achieve" checked={form.notify_when_achieve} onChange={(v) => setForm({ ...form, notify_when_achieve: v })} />
                    <Checkbox label="Notify staff members when goal failed to achieve" checked={form.notify_when_fail} onChange={(v) => setForm({ ...form, notify_when_fail: v })} />
                </div>
            </Modal>
        </div>
    );
}
