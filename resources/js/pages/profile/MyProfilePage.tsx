import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Mail, Pencil, Phone } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { PROJECT_STATUSES, optionById } from '../../lib/constants';
import { useApi } from '../../hooks/useApi';
import { Avatar, Button, ErrorNote, Spinner, StatusBadge } from '../../components/ui';
import type { AppNotification, Paginated } from '../../types';
import LoggedTimeStats, { type LoggedTime } from './LoggedTimeStats';

export type Profile = {
    id: number;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    mobile: string | null;
    employee_code: string | null;
    photo_url: string | null;
    is_active: boolean;
    is_own: boolean;
    facebook: string | null;
    linkedin: string | null;
    skype: string | null;
    email_signature: string | null;
    departments: string[];
    logged_time: LoggedTime | null;
    projects: { id: number; name: string; start_date: string | null; deadline: string | null; status: number }[];
};

/** Perfex "My Profile" (also a colleague's profile at /profile/:id). */
export default function MyProfilePage() {
    const { id } = useParams();
    const { data, error } = useApi<{ data: Profile }>(id ? `/profile/${id}` : '/profile');

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!data) {
        return <Spinner />;
    }
    const p = data.data;

    return (
        <div className="w-full space-y-6">
            {p.logged_time && (
                <>
                    <LoggedTimeStats stats={p.logged_time} />
                    <hr className="border-gray-200" />
                </>
            )}
            <div className="grid gap-6 lg:grid-cols-12">
                <div className="space-y-3 lg:col-span-5">
                    <h4 className="flex items-center gap-2 text-lg font-bold text-gray-700">
                        <Avatar id={p.id} name={p.full_name} photo={p.photo_url} />
                        {p.full_name}
                    </h4>
                    <div className="panel_s">
                        <div className="panel-body space-y-4">
                            {!p.is_active && <p className="rounded-md bg-red-50 p-2 text-center text-[13px] text-red-700">This account is inactive.</p>}
                            <div className="flex gap-3">
                                <div className="min-w-0 flex-1 space-y-1.5 text-[13.5px]">
                                    {p.email && (
                                        <p className="flex items-center gap-2">
                                            <Mail className="h-4 w-4 text-gray-400" />
                                            <a href={`mailto:${p.email}`} className="text-blue-600 hover:underline">
                                                {p.email}
                                            </a>
                                        </p>
                                    )}
                                    {p.mobile && (
                                        <p className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            {p.mobile}
                                        </p>
                                    )}
                                    {p.employee_code && <p className="text-gray-500">Employee code: {p.employee_code}</p>}
                                </div>
                                <div className="flex shrink-0 items-start gap-1">
                                    {p.facebook && <SocialLink href={p.facebook} label="Facebook" />}
                                    {p.linkedin && <SocialLink href={p.linkedin} label="LinkedIn" />}
                                    {p.skype && <SocialLink href={`skype:${p.skype}`} label="Skype" />}
                                    {p.is_own && (
                                        <Link to="/profile/edit" className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50" title="Edit Profile">
                                            <Pencil className="h-4 w-4" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                            {p.departments.length > 0 && (
                                <div>
                                    <p className="mb-1.5 text-[13px] font-semibold text-gray-600">Departments</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {p.departments.map((d) => (
                                            <span key={d} className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
                                                {d}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {p.logged_time && (
                                <div>
                                    <h5 className="mb-2 text-[15px] font-semibold text-gray-700">Projects</h5>
                                    <div className="-mx-4 overflow-x-auto">
                                        <table className="table-perfex">
                                            <thead>
                                                <tr>
                                                    <th>Project Name</th>
                                                    <th>Start Date</th>
                                                    <th>Deadline</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {p.projects.map((pr) => (
                                                    <tr key={pr.id}>
                                                        <td>
                                                            <Link to={`/projects/${pr.id}`} className="text-blue-600 hover:underline">
                                                                {pr.name}
                                                            </Link>
                                                        </td>
                                                        <td className="whitespace-nowrap">{formatDate(pr.start_date)}</td>
                                                        <td className="whitespace-nowrap">{formatDate(pr.deadline)}</td>
                                                        <td>
                                                            <StatusBadge option={optionById(PROJECT_STATUSES, pr.status)} />
                                                        </td>
                                                    </tr>
                                                ))}
                                                {p.projects.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="text-center text-gray-500">
                                                            No projects.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {p.is_own && (
                    <div className="lg:col-span-7">
                        <ProfileNotifications />
                    </div>
                )}
            </div>
        </div>
    );
}

function SocialLink({ href, label }: { href: string; label: string }) {
    return (
        <a href={href} target="_blank" rel="noreferrer" className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50" title={label}>
            {label}
        </a>
    );
}

/** The notifications list on My Profile, with "Mark all as read" and "Load more". */
function ProfileNotifications() {
    const navigate = useNavigate();
    const [perPage, setPerPage] = useState(10);
    const { data, reload } = useApi<Paginated<AppNotification>>('/notifications', { per_page: perPage });

    async function open(n: AppNotification) {
        if (!n.read_at) {
            await api.post(`/notifications/${n.id}/read`);
            reload();
        }
        if (n.link?.startsWith('/')) {
            navigate(n.link);
        }
    }

    return (
        <div>
            <h4 className="flex items-center justify-between text-lg font-bold text-gray-700">
                Notifications
                <button type="button" onClick={() => api.post('/notifications/read-all').then(reload)} className="text-sm font-normal text-gray-500 hover:text-gray-800">
                    Mark all as read
                </button>
            </h4>
            <div className="my-3 divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                {!data ? (
                    <Spinner />
                ) : data.data.length === 0 ? (
                    <p className="p-4 text-center text-[13px] text-gray-500">No notifications.</p>
                ) : (
                    data.data.map((n) => (
                        <button key={n.id} type="button" onClick={() => open(n)} className={`flex w-full gap-3 px-4 py-3 text-left text-[13.5px] hover:bg-gray-50 ${n.read_at ? '' : 'bg-blue-50/50'}`}>
                            <Avatar id={n.from_user?.id} name={n.from_user?.full_name ?? 'System'} />
                            <span className="min-w-0 flex-1">
                                <span className="font-semibold">{n.from_user?.full_name ?? 'Reminder'}</span> {n.description}
                                <span className="block text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                            </span>
                        </button>
                    ))
                )}
            </div>
            {data && data.meta.total > data.data.length && (
                <div className="text-right">
                    <Button onClick={() => setPerPage((n) => n + 10)}>Load More</Button>
                </div>
            )}
        </div>
    );
}
