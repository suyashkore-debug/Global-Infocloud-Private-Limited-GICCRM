import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Copy, Mail, Plus } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { SurveySummary } from './types';

/** Perfex Utilities → Surveys. */
export default function SurveysPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const canCreate = usePermission('surveys.create');
    const { data } = useApi<{ data: SurveySummary[] }>('/surveys');

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="page-title">Surveys</h4>
                <div className="flex gap-2">
                    <Link to="/utilities/mail-lists" className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                        <Mail className="h-4 w-4" /> Mail Lists
                    </Link>
                    {canCreate && (
                        <Button onClick={() => navigate('/utilities/surveys/new')}>
                            <Plus className="h-4 w-4" /> New Survey
                        </Button>
                    )}
                </div>
            </div>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No surveys yet" text="Create a survey, then send its link to customers, leads, staff or a mail list." />
            ) : (
                <div className="panel_s overflow-x-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Subject</th>
                                <th className="text-right">Questions</th>
                                <th className="text-right">Participants</th>
                                <th>Date Created</th>
                                <th>Active</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((s) => (
                                <tr key={s.id}>
                                    <td>{s.id}</td>
                                    <td>
                                        <Link to={`/utilities/surveys/${s.id}`} className="font-medium text-blue-600 hover:underline">
                                            {s.subject}
                                        </Link>
                                    </td>
                                    <td className="text-right">{s.questions_count}</td>
                                    <td className="text-right">{s.participants}</td>
                                    <td>{formatDate(s.created_at)}</td>
                                    <td>{s.active ? 'Yes' : 'No'}</td>
                                    <td>
                                        <div className="flex justify-end gap-3 text-xs">
                                            <Link to={`/utilities/surveys/${s.id}/results`} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
                                                <BarChart3 className="h-3.5 w-3.5" /> Results
                                            </Link>
                                            <a href={s.path} target="_blank" rel="noreferrer" className="text-gray-600 hover:text-gray-900">
                                                Open
                                            </a>
                                            <button type="button" onClick={() => navigator.clipboard.writeText(s.url).then(() => toast('Survey link copied.'))} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
                                                <Copy className="h-3.5 w-3.5" /> Link
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
