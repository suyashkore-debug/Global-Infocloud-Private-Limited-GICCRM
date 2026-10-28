import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Button, Input, Pagination, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Paginated } from '../../types';

export default function ActivityLogPage() {
    const { user } = useAuth();
    const toast = useToast();
    const [search, setSearch] = useState('');
    const [date, setDate] = useState('');
    const [page, setPage] = useState(1);
    const { data, reload } = useApi<Paginated<{ id: number; description: string; user: string | null; created_at: string }>>(user?.is_admin ? '/activity-log' : null, { search, date: date || undefined, page });

    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }

    async function clear() {
        if (!confirm('Clear the whole activity log?')) {
            return;
        }
        await api.delete('/activity-log');
        toast('Activity log cleared.');
        reload();
    }

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Activity Log</h4>
            <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={date} onChange={(e) => (setDate(e.target.value), setPage(1))} className="w-auto" />
                <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="w-64" />
                <Button variant="danger" onClick={clear} className="ml-auto">
                    Clear Log
                </Button>
            </div>
            {!data ? (
                <Spinner />
            ) : (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Date</th>
                                <th>Staff</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((l) => (
                                <tr key={l.id}>
                                    <td>{l.description}</td>
                                    <td className="whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                                    <td>{l.user ?? 'System'}</td>
                                </tr>
                            ))}
                            {data.data.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="text-center text-gray-500">
                                        No activity.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}
        </div>
    );
}
