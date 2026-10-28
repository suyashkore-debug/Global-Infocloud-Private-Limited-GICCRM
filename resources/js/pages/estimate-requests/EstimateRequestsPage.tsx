import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileInput, Search } from 'lucide-react';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { useStaff } from '../../hooks/useStaff';
import { EmptyState, ErrorNote, Input, Pagination, Select, Spinner, StatusBadge, Tag } from '../../components/ui';
import type { EstimateRequestRow, RequestStatus } from './types';

type List = { data: EstimateRequestRow[]; meta: { current_page: number; last_page: number; total: number; summary: RequestStatus[] } };

/** Perfex Estimate Request: requests received through the web forms. */
export default function EstimateRequestsPage() {
    const { user } = useAuth();
    const staff = useStaff();
    const navigate = useNavigate();
    const [status, setStatus] = useState('');
    const [assigned, setAssigned] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<List>('/estimate-requests', { status: status || undefined, assigned_id: assigned || undefined, search, page });

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="page-title">Estimate Requests</h4>
                {user?.is_admin && (
                    <Link to="/estimate-requests/forms" className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                        <FileInput className="h-4 w-4" /> Forms
                    </Link>
                )}
            </div>
            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {data.meta.summary.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => (setStatus(status === String(s.id) ? '' : String(s.id)), setPage(1))}
                            className={`panel_s text-left ${status === String(s.id) ? 'ring-2 ring-blue-400' : ''}`}
                        >
                            <div className="panel-body">
                                <p className="text-xl font-semibold text-gray-900">{s.count}</p>
                                <p className="text-[13px] font-medium" style={{ color: s.color }}>
                                    {s.name}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <Select value={assigned} onChange={(e) => (setAssigned(e.target.value), setPage(1))} className="w-auto">
                    <option value="">Any assignee</option>
                    {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.full_name}
                        </option>
                    ))}
                </Select>
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data ? null : data.data.length === 0 ? (
                <EmptyState title="No estimate requests" text="Requests submitted through your web forms show up here." />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Email</th>
                                    <th>Form</th>
                                    <th>Assigned</th>
                                    <th>Status</th>
                                    <th>Tags</th>
                                    <th>Date Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((r) => (
                                    <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/estimate-requests/${r.id}`)}>
                                        <td>{r.id}</td>
                                        <td className="font-medium text-blue-600">{r.email}</td>
                                        <td>{r.form}</td>
                                        <td>{r.assigned?.full_name}</td>
                                        <td>{r.status && <StatusBadge option={r.status} />}</td>
                                        <td>
                                            <div className="flex flex-wrap gap-1">
                                                {r.tags.map((t) => (
                                                    <Tag key={t}>{t}</Tag>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap" title={formatDateTime(r.created_at)}>
                                            {timeAgo(r.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}
        </div>
    );
}
