import { useState } from 'react';
import { ACTIVITY_LABELS } from '../../../lib/constants';
import { formatDateTime, timeAgo } from '../../../lib/format';
import { useApi } from '../../../hooks/useApi';
import { Avatar, Card, EmptyState, Pagination, Spinner } from '../../../components/ui';
import type { Activity, Paginated, Project } from '../../../types';

export default function ActivityTab({ project }: { project: Project }) {
    const [page, setPage] = useState(1);
    const { data } = useApi<Paginated<Activity>>(`/projects/${project.id}/activity`, { page });

    if (!data) {
        return <Spinner />;
    }
    if (data.data.length === 0) {
        return <EmptyState title="No activity yet" />;
    }

    return (
        <Card className="p-5">
            <ol className="relative space-y-5 border-l border-gray-200 pl-6">
                {data.data.map((item) => (
                    <li key={item.id} className="relative">
                        <span className="absolute -left-[37px] top-0">
                            <Avatar id={item.user?.id} name={item.user?.full_name} size="sm" />
                        </span>
                        <p className="text-sm">
                            <span className="font-semibold">{item.user?.full_name ?? 'System'}</span> {ACTIVITY_LABELS[item.description_key] ?? item.description_key}
                        </p>
                        {item.additional_data && <p className="mt-0.5 text-sm text-gray-600">{item.additional_data}</p>}
                        <p className="mt-0.5 text-xs text-gray-400" title={formatDateTime(item.created_at)}>
                            {timeAgo(item.created_at)}
                        </p>
                    </li>
                ))}
            </ol>
            <div className="mt-5">
                <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
            </div>
        </Card>
    );
}
