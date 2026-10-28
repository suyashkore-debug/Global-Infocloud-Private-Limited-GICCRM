import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { BarChart } from '../../components/charts/BarChart';
import { Spinner } from '../../components/ui';
import { Panel, ReportPage, useYear } from './shared';

/** Perfex Reports > Expenses vs Income: payments received against expenses per month. */
export default function ExpensesVsIncomePage() {
    const { year, picker } = useYear();
    const { data } = useApi<{ data: { months: string[]; income: number[]; expenses: number[] } }>('/reports/expenses-vs-income', { year });
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

    return (
        <ReportPage title="Expenses vs Income" actions={picker}>
            {!data ? (
                <Spinner />
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {[
                            { label: 'Income', value: sum(data.data.income) },
                            { label: 'Expenses', value: sum(data.data.expenses) },
                            { label: 'Net', value: sum(data.data.income) - sum(data.data.expenses) },
                        ].map((t) => (
                            <div key={t.label} className="panel_s">
                                <div className="panel-body">
                                    <p className="text-[13px] text-gray-500">
                                        {t.label} {year}
                                    </p>
                                    <p className="mt-1 text-2xl font-semibold text-gray-900">{money(t.value)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Panel>
                        <BarChart
                            labels={data.data.months}
                            series={[
                                { name: 'Income', values: data.data.income },
                                { name: 'Expenses', values: data.data.expenses },
                            ]}
                            format={(v) => money(v)}
                            height={300}
                        />
                    </Panel>
                    <div className="panel_s overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th className="text-right">Income</th>
                                    <th className="text-right">Expenses</th>
                                    <th className="text-right">Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.months.map((m, i) => (
                                    <tr key={m}>
                                        <td>{m}</td>
                                        <td className="text-right">{money(data.data.income[i])}</td>
                                        <td className="text-right">{money(data.data.expenses[i])}</td>
                                        <td className="text-right font-medium">{money(data.data.income[i] - data.data.expenses[i])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportPage>
    );
}
