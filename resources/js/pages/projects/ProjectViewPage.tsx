import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, CalendarClock, CalendarDays, ChevronDown, Copy, ExternalLink, FolderKanban, MoreHorizontal, Pencil, Pin, PinOff, Plus, Receipt, Trash2 } from 'lucide-react';
import { formatDate, toIsoDate } from '../../lib/format';
import { api, errorMessage } from '../../lib/api';
import { PROJECT_STATUSES, optionById } from '../../lib/constants';
import { emit, PROJECT_CHANGED, TASKS_CHANGED } from '../../lib/events';
import { useApi } from '../../hooks/useApi';
import { useEvent } from '../../hooks/useEvent';
import { usePermission } from '../../hooks/usePermission';
import { AvatarStack, Button, Checkbox, ErrorNote, IconButton, Menu, MenuItem, Modal, ProgressBar, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import TasksBoard from '../../components/tasks/TasksBoard';
import { useTaskModals } from '../../components/tasks/TaskModalHost';
import type { Project } from '../../types';
import { ContractsTable } from '../crm/ContractsPage';
import { ExpensesTable } from '../crm/ExpensesPage';
import { CreditNotesTable } from '../sales/CreditNotesPage';
import { ProposalsTable } from '../sales/ProposalsPage';
import { TicketsTable } from '../crm/TicketsPage';
import { EstimatesTable } from '../sales/EstimatesPage';
import { InvoicesTable } from '../sales/InvoicesPage';
import CopyProjectModal from './CopyProjectModal';
import InvoiceProjectModal from './InvoiceProjectModal';
import ProjectFormModal from './ProjectFormModal';
import ActivityTab from './tabs/ActivityTab';
import DiscussionsTab from './tabs/DiscussionsTab';
import FilesTab from './tabs/FilesTab';
import GanttTab from './tabs/GanttTab';
import MilestonesTab from './tabs/MilestonesTab';
import NotesTab from './tabs/NotesTab';
import OverviewTab from './tabs/OverviewTab';
import TimesheetsTab from './tabs/TimesheetsTab';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'timesheets', label: 'Timesheets' },
    { id: 'milestones', label: 'Milestones' },
    { id: 'files', label: 'Files' },
    { id: 'discussions', label: 'Discussions' },
    { id: 'gantt', label: 'Gantt' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'contracts', label: 'Contracts' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'estimates', label: 'Estimates' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'credit_notes', label: 'Credit Notes' },
    { id: 'proposals', label: 'Proposals' },
    { id: 'notes', label: 'Notes' },
    { id: 'activity', label: 'Activity' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ProjectViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { newTask } = useTaskModals();
    const [params, setParams] = useSearchParams();
    const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId;
    const { data, error, reload, setData } = useApi<{ data: Project }>(`/projects/${id}`);
    useEvent([PROJECT_CHANGED, TASKS_CHANGED], reload);
    const [editOpen, setEditOpen] = useState(false);
    const [copyOpen, setCopyOpen] = useState(false);
    const [invoiceOpen, setInvoiceOpen] = useState(false);
    const canInvoice = usePermission('invoices.create');
    const [statusTarget, setStatusTarget] = useState<number | null>(null);

    const project = data?.data;
    usePageCrumb(project?.name);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!project) {
        return <Spinner />;
    }

    const setTab = (next: TabId) => setParams({ tab: next });

    async function togglePin() {
        if (!project) {
            return;
        }
        const { data: result } = await api.post<{ is_pinned: boolean }>(`/projects/${project.id}/pin`);
        setData({ data: { ...project, is_pinned: result.is_pinned } });
        emit(PROJECT_CHANGED);
    }

    async function remove() {
        if (!project || !confirm(`Delete project "${project.name}"? All its tasks, milestones, files and discussions are deleted too.`)) {
            return;
        }
        try {
            await api.delete(`/projects/${project.id}`);
            toast('Project deleted.');
            navigate('/projects');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-5">
            <div className="panel_s !mb-0 overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: optionById(PROJECT_STATUSES, project.status)?.color ?? '#0b2c56' }} />
                <div className="flex flex-wrap items-start gap-4 px-5 pb-5 pt-4 sm:px-6">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                        <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2c56] to-[#1a4f8f] text-white shadow-md shadow-brand/20 sm:flex">
                            <FolderKanban className="h-6 w-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h1 className=" flex flex-wrap items-center gap-2 text-[22px] font-bold leading-tight tracking-tight text-slate-800">
                                <span className="text-slate-400">#{project.id}</span> {project.name}
                                <StatusBadge option={optionById(PROJECT_STATUSES, project.status)} />
                            </h1>
                            {project.customer && (
                                <Link to={`/customers/${project.customer.id}`} className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 hover:text-brand">
                                    <Building2 className="h-4 w-4" /> {project.customer.name}
                                </Link>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
                                <HeaderFact icon={CalendarDays} label="Start date" value={formatDate(project.start_date)} />
                                <HeaderFact
                                    icon={CalendarClock}
                                    label="Deadline"
                                    value={project.deadline ? formatDate(project.deadline) : 'No deadline'}
                                    danger={!!project.deadline && ![4, 5].includes(project.status) && project.deadline < toIsoDate(new Date())}
                                />
                                {(project.members?.length ?? 0) > 0 && (
                                    <div className="flex items-center gap-2">
                                        <AvatarStack people={project.members ?? []} max={5} />
                                        <span className="text-slate-500">{project.members?.length} {project.members?.length === 1 ? 'member' : 'members'}</span>
                                    </div>
                                )}
                                <div className="flex min-w-[12rem] flex-1 items-center gap-2.5 sm:max-w-xs">
                                    <ProgressBar value={project.calculated_progress} />
                                    <span className="text-[13px] font-bold text-slate-700">{project.calculated_progress}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {project.can.create_tasks && (
                            <Button onClick={() => newTask({ project_id: project.id })}>
                                <Plus className="h-4 w-4" /> New task
                            </Button>
                        )}
                        {canInvoice && (
                            <Button variant="secondary" onClick={() => setInvoiceOpen(true)}>
                                <Receipt className="h-4 w-4" /> Invoice project
                            </Button>
                        )}
                        {project.can.update && (
                            <Menu
                                trigger={(toggle) => (
                                    <Button variant="secondary" onClick={toggle}>
                                        Mark as <ChevronDown className="h-4 w-4" />
                                    </Button>
                                )}
                            >
                                {(close) =>
                                    PROJECT_STATUSES.filter((s) => s.id !== project.status).map((s) => (
                                        <MenuItem key={s.id} onClick={() => (close(), setStatusTarget(s.id))}>
                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                                            {s.name}
                                        </MenuItem>
                                    ))
                                }
                            </Menu>
                        )}
                        <IconButton label={project.is_pinned ? 'Unpin project' : 'Pin project'} onClick={togglePin}>
                            {project.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </IconButton>
                        <Menu
                            trigger={(toggle) => (
                                <IconButton label="More actions" onClick={toggle}>
                                    <MoreHorizontal className="h-4 w-4" />
                                </IconButton>
                            )}
                        >
                            {(close) => (
                                <>
                                    {project.can.update && (
                                        <MenuItem onClick={() => (close(), setEditOpen(true))}>
                                            <Pencil className="h-4 w-4" /> Edit project
                                        </MenuItem>
                                    )}
                                    <MenuItem onClick={() => (close(), setCopyOpen(true))}>
                                        <Copy className="h-4 w-4" /> Copy project
                                    </MenuItem>
                                    {project.can.delete && (
                                        <MenuItem danger onClick={() => (close(), remove())}>
                                            <Trash2 className="h-4 w-4" /> Delete project
                                        </MenuItem>
                                    )}
                                </>
                            )}
                        </Menu>
                    </div>
                </div>
            </div>

            {invoiceOpen && <InvoiceProjectModal project={project} onClose={() => setInvoiceOpen(false)} />}
            <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                    <Tabs tabs={[...TABS]} active={tab} onChange={setTab} />
                </div>
                {project.workspace_link && (
                    <a href={project.workspace_link} target="_blank" rel="noreferrer" className="mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold text-brand hover:bg-brand-50" title={project.workspace_link}>
                        <ExternalLink className="h-4 w-4" /> Workspace Link
                    </a>
                )}
            </div>

            {tab === 'overview' && <OverviewTab project={project} />}
            {tab === 'tasks' && <TasksBoard projectId={project.id} canCreate={project.can.create_tasks} />}
            {tab === 'timesheets' && <TimesheetsTab project={project} />}
            {tab === 'milestones' && <MilestonesTab project={project} />}
            {tab === 'files' && <FilesTab project={project} />}
            {tab === 'discussions' && <DiscussionsTab project={project} />}
            {tab === 'gantt' && <GanttTab project={project} />}
            {tab === 'invoices' && <InvoicesTable customerId={project.customer?.id} projectId={project.id} />}
            {tab === 'estimates' && <EstimatesTable customerId={project.customer?.id} projectId={project.id} />}
            {tab === 'expenses' && <ExpensesTable customerId={project.customer?.id} projectId={project.id} />}
            {tab === 'tickets' && <TicketsTable projectId={project.id} />}
            {tab === 'contracts' && <ContractsTable customerId={project.customer?.id} projectId={project.id} />}
            {tab === 'credit_notes' && <CreditNotesTable customerId={project.customer?.id} projectId={project.id} />}
            {tab === 'proposals' && <ProposalsTable customerId={project.customer?.id} projectId={project.id} />}
            {tab === 'notes' && <NotesTab project={project} />}
            {tab === 'activity' && <ActivityTab project={project} />}

            <ProjectFormModal
                open={editOpen}
                project={project}
                onClose={() => setEditOpen(false)}
                onSaved={() => {
                    setEditOpen(false);
                    emit(PROJECT_CHANGED);
                }}
            />
            <CopyProjectModal open={copyOpen} project={project} onClose={() => setCopyOpen(false)} onCopied={(copy) => (setCopyOpen(false), navigate(`/projects/${copy.id}`))} />
            <MarkAsModal project={project} status={statusTarget} onClose={() => setStatusTarget(null)} />
        </div>
    );
}

/** Perfex "Mark as": finishing can also complete every task; members can be notified. */
function MarkAsModal({ project, status, onClose }: { project: Project; status: number | null; onClose: () => void }) {
    const toast = useToast();
    const [completeTasks, setCompleteTasks] = useState(true);
    const [notify, setNotify] = useState(false);
    const [saving, setSaving] = useState(false);
    const option = optionById(PROJECT_STATUSES, status);

    async function save() {
        setSaving(true);
        try {
            await api.post(`/projects/${project.id}/status`, { status, mark_all_tasks_complete: status === 4 && completeTasks, notify_members: notify });
            toast(`Project marked as ${option?.name}.`);
            emit(PROJECT_CHANGED);
            emit(TASKS_CHANGED);
            onClose();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={status !== null}
            onClose={onClose}
            size="sm"
            title={`Mark project as ${option?.name ?? ''}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving}>
                        Confirm
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                {status === 4 && <Checkbox label="Mark all tasks as complete" checked={completeTasks} onChange={setCompleteTasks} />}
                <Checkbox label="Send notification to project members" checked={notify} onChange={setNotify} />
            </div>
        </Modal>
    );
}

function HeaderFact({ icon: Icon, label, value, danger }: { icon: typeof CalendarDays; label: string; value: string; danger?: boolean }) {
    return (
        <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${danger ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="leading-tight">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
                <span className={`font-semibold ${danger ? 'text-red-600' : 'text-slate-700'}`}>{value}</span>
            </span>
        </div>
    );
}
