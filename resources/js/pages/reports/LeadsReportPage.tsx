import { useApi } from '../../hooks/useApi';
import { BarChart, BarList } from '../../components/charts/BarChart';
import { Spinner } from '../../components/ui';
import { Panel, ReportPage, useYear } from './shared';

type Data = { months: string[]; new: number[]; converted: number[]; sources: { source: string; leads: number; converted: number }[]; this_week_converted: number };

/** Perfex Reports > Leads: new vs converted leads per month and conversions by source. */
export default function LeadsReportPage() {
    const { year, picker } = useYear();
    const { data } = useApi<{ data: Data }>('/reports/leads', { year });
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

    return (
        <ReportPage title="Leads Report" actions={picker}>
            {!data ? (
                <Spinner />
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {[
                            { label: `New leads ${year}`, value: sum(data.data.new) },
                            { label: `Converted ${year}`, value: sum(data.data.converted) },
                            { label: 'Converted this week', value: data.data.this_week_converted },
                        ].map((t) => (
                            <div key={t.label} className="panel_s">
                                <div className="panel-body">
                                    <p className="text-[13px] text-gray-500">{t.label}</p>
                                    <p className="mt-1 text-2xl font-semibold text-gray-900">{t.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Panel title="Leads by month">
                        <BarChart
                            labels={data.data.months}
                            series={[
                                { name: 'New leads', values: data.data.new },
                                { name: 'Converted to customer', values: data.data.converted },
                            ]}
                            format={(v) => String(v)}
                        />
                    </Panel>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel title="Conversions by source">
                            <BarList rows={data.data.sources.map((s) => ({ label: s.source, value: s.converted }))} format={(v) => String(v)} color="#1baf7a" />
                        </Panel>
                        <div className="panel_s overflow-x-auto">
                            <table className="table-perfex">
                                <thead>
                                    <tr>
                                        <th>Source</th>
                                        <th className="text-right">Leads</th>
                                        <th className="text-right">Converted</th>
                                        <th className="text-right">Conversion rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.data.sources.map((s) => (
                                        <tr key={s.source}>
                                            <td>{s.source}</td>
                                            <td className="text-right">{s.leads}</td>
                                            <td className="text-right">{s.converted}</td>
                                            <td className="text-right">{s.leads ? Math.round((s.converted / s.leads) * 100) : 0}%</td>
                                        </tr>
                                    ))}
                                    {data.data.sources.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="text-center text-gray-500">
                                                No leads in {year}.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </ReportPage>
    );
}
