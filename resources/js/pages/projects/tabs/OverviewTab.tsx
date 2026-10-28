import { useEffect, useState, type ReactNode } from 'react';
import { Users } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { BILLING_TYPES, PROJECT_STATUSES, TASK_STATUSES, optionById } from '../../../lib/constants';
import { emit, PROJECT_CHANGED, TASKS_CHANGED } from '../../../lib/events';
import { formatDate, formatDuration, formatMoney } from '../../../lib/format';
import { useApi } from '../../../hooks/useApi';
import { useEvent } from '../../../hooks/useEvent';
import { useStaff } from '../../../hooks/useStaff';
import { Avatar, Button, Card, Modal, ProgressBar, Spinner, StaffMultiSelect, StatusBadge, Tag } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import type { Project } from '../../../types';
import { CustomFieldsView } from '../../../components/customfields/CustomFields';

interface Overview {
    progress: number;
    tasks_total: number;
    tasks_completed: number;
    tasks_by_status: Record<string, number>;
    days_total: number | null;
    days_left: number | null;
    total_logged_seconds: number;
    estimated_hours: number | null;
    billable_seconds: number;
    total_amount: number;
    week: { date: string; seconds: number }[];
    logged_by_member: Record<string, number>;
}

export default function OverviewTab({ project }: { project: Project }) {
    const { data, reload } = useApi<{ data: Overview }>(`/projects/${project.id}/overview`);
    useEvent([TASKS_CHANGED, PROJECT_CHANGED], reload);
    const [membersOpen, setMembersOpen] = useState(false);
    const overview = data?.data;

    if (!overview) {
        return <Spinner />;
    }

    const maxWeek = Math.max(1, ...overview.week.map((d) => d.seconds));
    const loggedHours = overview.total_logged_seconds / 3600;

    return (
        <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Stat
                        title="Open tasks"
                        value={`${overview.tasks_total - overview.tasks_completed} / ${overview.tasks_total}`}
                        progress={overview.tasks_total ? (overview.tasks_completed / overview.tasks_total) * 100 : 0}
                        hint={`${overview.tasks_completed} completed`}
                    />
                    <Stat
                        title="Days left"
                        value={overview.days_left === null ? 'No deadline' : `${overview.days_left} / ${overview.days_total}`}
                        progress={overview.days_total ? ((overview.days_total - Math.max(0, overview.days_left ?? 0)) / overview.days_total) * 100 : 0}
                        hint={overview.days_left !== null && overview.days_left < 0 ? `${Math.abs(overview.days_left)} days overdue` : undefined}
                        danger={overview.days_left !== null && overview.days_left < 0}
                    />
                </div>

                <Card className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-semibold">Project progress</h3>
                        <span className="text-sm font-semibold text-blue-700">{overview.progress}%</span>
                    </div>
                    <ProgressBar value={overview.progress} />
                    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                        <Detail label="Customer" value={project.customer?.name} />
                        <Detail label="Status" value={<StatusBadge option={optionById(PROJECT_STATUSES, project.status)} />} />
                        <Detail label="Billing type" value={BILLING_TYPES.find((b) => b.id === project.billing_type)?.name} />
                        {project.billing_type === 1 && <Detail label="Total rate" value={formatMoney(project.project_cost)} />}
                        {project.billing_type === 2 && <Detail label="Rate per hour" value={formatMoney(project.project_rate_per_hour)} />}
                        <Detail label="Start date" value={formatDate(project.start_date)} />
                        <Detail label="Deadline" value={formatDate(project.deadline)} />
                        {project.date_finished && <Detail label="Finished" value={formatDate(project.date_finished)} />}
                        <Detail label="Estimated hours" value={overview.estimated_hours !== null ? `${overview.estimated_hours} h` : '—'} />
                        <Detail label="Created by" value={project.created_by?.full_name} />
                    </dl>
                    <CustomFieldsView to="projects" id={project.id} className="mt-4 border-t border-gray-100 pt-4" />
                    {project.tags && project.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1">
                            {project.tags.map((t) => (
                                <Tag key={t}>{t}</Tag>
                            ))}
                        </div>
                    )}
                    {project.description && (
                        <div className="mt-5 border-t border-gray-100 pt-4">
                            <h4 className="mb-1 text-sm font-semibold">Description</h4>
                            <p className="whitespace-pre-wrap text-sm text-gray-700">{project.description}</p>
                        </div>
                    )}
                </Card>

                <Card className="p-5">
                    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">Logged hours this week</h3>
                        <span className="text-sm text-gray-500">Total: {formatDuration(overview.total_logged_seconds)} h</span>
                    </div>
                    <div className="flex h-40 items-end gap-2">
                        {overview.week.map((day) => (
                            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                                <span className="text-[10px] text-gray-500">{day.seconds ? formatDuration(day.seconds) : ''}</span>
                                <div className="w-full rounded-t bg-brand" style={{ height: `${(day.seconds / maxWeek) * 100}%`, minHeight: day.seconds ? 4 : 0 }} />
                                <span className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="space-y-5">
                <Card className="p-5">
                    <h3 className="mb-3 font-semibold">Finance overview</h3>
                    <dl className="space-y-3 text-sm">
                        <Row label="Total logged time" value={`${formatDuration(overview.total_logged_seconds)} h`} />
                        <Row label="Billable time" value={`${formatDuration(overview.billable_seconds)} h`} />
                        {overview.estimated_hours !== null && <Row label="Estimated vs logged" value={`${overview.estimated_hours} h / ${loggedHours.toFixed(2)} h`} />}
                        <Row label={project.billing_type === 1 ? 'Project cost' : 'Total by hours'} value={formatMoney(overview.total_amount)} strong />
                    </dl>
                </Card>

                <Card className="p-5">
                    <h3 className="mb-3 font-semibold">Tasks by status</h3>
                    <ul className="space-y-2 text-sm">
                        {TASK_STATUSES.map((s) => (
                            <li key={s.id} className="flex items-center justify-between">
                                <StatusBadge option={s} />
                                <span className="font-medium">{overview.tasks_by_status[s.id] ?? 0}</span>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-semibold">Members</h3>
                        {project.can.update && (
                            <Button size="sm" variant="ghost" onClick={() => setMembersOpen(true)}>
                                <Users className="h-4 w-4" /> Manage
                            </Button>
                        )}
                    </div>
                    <ul className="space-y-2.5">
                        {project.members?.map((m) => (
                            <li key={m.id} className="flex items-center gap-2.5 text-sm">
                                <Avatar id={m.id} name={m.full_name} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{m.full_name}</span>
                                    <span className="block text-xs text-gray-500">{formatDuration(overview.logged_by_member[m.id] ?? 0)} h logged</span>
                                </span>
                            </li>
                        ))}
                        {project.members?.length === 0 && <li className="text-sm text-gray-400">No members yet.</li>}
                    </ul>
                </Card>
            </div>

            <MembersModal open={membersOpen} project={project} onClose={() => setMembersOpen(false)} />
        </div>
    );
}

function MembersModal({ open, project, onClose }: { open: boolean; project: Project; onClose: () => void }) {
    const staff = useStaff();
    const toast = useToast();
    const [members, setMembers] = useState<number[]>(project.members?.map((m) => m.id) ?? []);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setMembers(project.members?.map((m) => m.id) ?? []);
        }
    }, [open, project]);

    async function save() {
        setSaving(true);
        try {
            await api.put(`/projects/${project.id}/members`, { members });
            toast('Members updated.');
            emit(PROJECT_CHANGED);
            onClose();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="sm"
            title="Project members"
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
            <StaffMultiSelect staff={staff} value={members} onChange={setMembers} />
        </Modal>
    );
}

function Stat({ title, value, progress, hint, danger }: { title: string; value: string; progress: number; hint?: string; danger?: boolean }) {
    return (
        <Card className="p-5">
            <p className="text-sm text-gray-500">{title}</p>
            <p className={`mt-1 text-2xl font-semibold ${danger ? 'text-red-600' : ''}`}>{value}</p>
            <div className="mt-3">
                <ProgressBar value={progress} color={danger ? '#dc2626' : '#4f46e5'} />
            </div>
            {hint && <p className={`mt-2 text-xs ${danger ? 'text-red-600' : 'text-gray-500'}`}>{hint}</p>}
        </Card>
    );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <dt className="text-gray-500">{label}</dt>
            <dd className="mt-0.5 font-medium">{value || '—'}</dd>
        </div>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500">{label}</dt>
            <dd className={strong ? 'font-semibold text-gray-900' : 'font-medium'}>{value}</dd>
        </div>
    );
}
