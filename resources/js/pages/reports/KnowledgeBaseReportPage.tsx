import { useApi } from '../../hooks/useApi';
import { Spinner } from '../../components/ui';
import { ReportPage } from './shared';

type Row = { article: string; group: string | null; views: number; helpful: number; not_helpful: number };

/** Perfex Reports > Knowledge base articles: views and helpful / not helpful votes. */
export default function KnowledgeBaseReportPage() {
    const { data } = useApi<{ data: Row[] }>('/reports/knowledge-base');

    return (
        <ReportPage title="Knowledge Base Articles">
            {!data ? (
                <Spinner />
            ) : (
                <div className="panel_s overflow-x-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Article</th>
                                <th>Group</th>
                                <th className="text-right">Views</th>
                                <th className="text-right">Helpful</th>
                                <th className="text-right">Not helpful</th>
                                <th className="text-right">Helpful %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((r, i) => {
                                const votes = r.helpful + r.not_helpful;

                                return (
                                    <tr key={i}>
                                        <td className="font-medium">{r.article}</td>
                                        <td>{r.group}</td>
                                        <td className="text-right">{r.views}</td>
                                        <td className="text-right">{r.helpful}</td>
                                        <td className="text-right">{r.not_helpful}</td>
                                        <td className="text-right">{votes ? `${Math.round((r.helpful / votes) * 100)}%` : '-'}</td>
                                    </tr>
                                );
                            })}
                            {data.data.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center text-gray-500">
                                        No articles yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </ReportPage>
    );
}
