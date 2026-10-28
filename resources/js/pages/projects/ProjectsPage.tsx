import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Pin, Plus, Search } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { DEFAULT_PROJECT_STATUS_FILTER, PROJECT_STATUSES, optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { SummaryCard, AvatarStack, Button, Card, EmptyState, ErrorNote, Input, Pagination, ProgressBar, Spinner, StatusBadge, Tag } from '../../components/ui';
import type { Paginated, Project } from '../../types';
import ProjectFormModal from './ProjectFormModal';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

type ProjectList = Paginated<Project> & { meta: { status_counts: Record<string, number> } };

export default function ProjectsPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const canCreate = usePermission('projects.create');
    const [statuses, setStatuses] = useState<number[]>(DEFAULT_PROJECT_STATUS_FILTER);
    const [search, setSearch] = useState(params.get('search') ?? '');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<{ by: string; direction: 'asc' | 'desc' }>({ by: 'id', direction: 'desc' });
    const [formOpen, setFormOpen] = useState(params.get('new') === '1');
    const { data, loading, error } = useApi<ProjectList>('/projects', { status: statuses.length ? statuses : [0], search, page, sort: sort.by, direction: sort.direction });

    const toggleStatus = (id: number) => {
        setPage(1);
        setStatuses((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
    };
    const sortBy = (by: string) => setSort((s) => ({ by, direction: s.by === by && s.direction === 'asc' ? 'desc' : 'asc' }));
    const header = (label: string, by: string) => (
        <th className="cursor-pointer select-none px-4 py-3 hover:text-gray-800" onClick={() => sortBy(by)}>
            {label}
            {sort.by === by && <span className="ml-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
        </th>
    );

    return (
        <div className="w-full space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold">Projects</h1>
                {canCreate && (
                    <Button onClick={() => setFormOpen(true)}>
                        <Plus className="h-4 w-4" /> New project
                    </Button>
                )}
            </div>

            {/* Perfex status summary: click a card to filter by that status. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {PROJECT_STATUSES.map((status) => {
                    const active = statuses.includes(status.id);

                    return (
                        <SummaryCard key={status.id} label={status.name} color={status.color} value={data?.meta.status_counts[status.id] ?? 0} muted={!active} onClick={() => toggleStatus(status.id)} />
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    placeholder="Search name, customer or tag…"
                    className="pl-9"
                />
            </div>
            <span className="ml-auto" />
            <SavedFilters identifier="projects" current={{ statuses, search }} onApply={(f) => (setStatuses(savedIds(f.statuses, DEFAULT_PROJECT_STATUS_FILTER)), setSearch(savedText(f.search)), setPage(1))} />
            </div>

            <ErrorNote message={error} />

            {loading && !data ? (
                <Spinner />
            ) : data && data.data.length === 0 ? (
                <EmptyState title="No projects found" text="Change the status filters above, or create a new project." />
            ) : (
                <Card className="overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <tr>
                                    {header('#', 'id')}
                                    {header('Project name', 'name')}
                                    <th className="px-4 py-3">Customer</th>
                                    <th className="px-4 py-3">Tags</th>
                                    {header('Start date', 'start_date')}
                                    {header('Deadline', 'deadline')}
                                    <th className="px-4 py-3">Members</th>
                                    <th className="px-4 py-3">Progress</th>
                                    {header('Status', 'status')}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data?.data.map((project) => (
                                    <tr key={project.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/projects/${project.id}`)}>
                                        <td className="px-4 py-3 text-gray-500">{project.id}</td>
                                        <td className="px-4 py-3">
                                            <Link to={`/projects/${project.id}`} className="font-medium text-blue-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                                                {project.name}
                                            </Link>
                                            {project.is_pinned && <Pin className="ml-1.5 inline h-3.5 w-3.5 text-amber-500" />}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{project.customer?.name}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">{project.tags?.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(project.start_date)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(project.deadline)}</td>
                                        <td className="px-4 py-3">
                                            <AvatarStack people={project.members} />
                                        </td>
                                        <td className="w-36 px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <ProgressBar value={project.calculated_progress} />
                                                <span className="w-9 text-right text-xs text-gray-500">{project.calculated_progress}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge option={optionById(PROJECT_STATUSES, project.status)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {data && (
                        <div className="border-t border-gray-100 px-4 py-3">
                            <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                        </div>
                    )}
                </Card>
            )}

            <ProjectFormModal open={formOpen} project={null} onClose={() => setFormOpen(false)} onSaved={(project) => navigate(`/projects/${project.id}`)} />
        </div>
    );
}
