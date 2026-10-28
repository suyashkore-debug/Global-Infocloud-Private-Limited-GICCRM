import { formatDuration } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { BarList } from '../../components/charts/BarChart';
import { Spinner } from '../../components/ui';
import { Panel, ReportPage, usePeriod } from './shared';

type Row = { staff: string; total_seconds: number; billable_seconds: number; entries: number };

/** Perfex Reports > Timesheets overview: time logged on tasks per staff member. */
export default function TimesheetsReportPage() {
    const { period, picker } = usePeriod();
    const { data } = useApi<{ data: Row[] }>('/reports/timesheets', period);
    const rows = data?.data ?? [];
    const total = rows.reduce((s, r) => s + r.total_seconds, 0);

    return (
        <ReportPage title="Timesheets Overview" actions={picker}>
            {!data ? (
                <Spinner />
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title={`Total logged — ${formatDuration(total)}`}>
                        <BarList rows={rows.map((r) => ({ label: r.staff, value: r.total_seconds }))} format={formatDuration} />
                    </Panel>
                    <div className="panel_s self-start overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Staff</th>
                                    <th className="text-right">Timers</th>
                                    <th className="text-right">Billable</th>
                                    <th className="text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.staff}>
                                        <td>{r.staff}</td>
                                        <td className="text-right">{r.entries}</td>
                                        <td className="text-right">{formatDuration(r.billable_seconds)}</td>
                                        <td className="text-right font-medium">{formatDuration(r.total_seconds)}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="text-center text-gray-500">
                                            No time logged in this period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </ReportPage>
    );
}
