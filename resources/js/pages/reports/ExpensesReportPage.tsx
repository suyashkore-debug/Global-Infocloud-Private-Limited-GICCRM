import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { useState } from 'react';
import { BarChart } from '../../components/charts/BarChart';
import { Spinner } from '../../components/ui';
import { Panel, ReportPage, useYear } from './shared';

type Data = { months: string[]; categories: { category: string; months: number[] }[]; totals: number[] };

/** Perfex Reports > Expenses: amount per category per month (tax included) and the monthly total. */
export default function ExpensesReportPage() {
    const { year, picker } = useYear();
    const [excludeBillable, setExcludeBillable] = useState(false);
    const { data } = useApi<{ data: Data }>('/reports/expenses', { year, exclude_billable: excludeBillable ? 1 : undefined });
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

    return (
        <ReportPage
            title="Expenses Report"
            actions={
                <div className="flex items-center gap-3 text-[13px]">
                    <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={excludeBillable} onChange={(e) => setExcludeBillable(e.target.checked)} /> Exclude billable expenses
                    </label>
                    {picker}
                </div>
            }
        >
            {!data ? (
                <Spinner />
            ) : (
                <>
                    <Panel title={`Expenses ${year} — ${money(sum(data.data.totals))}`}>
                        <BarChart labels={data.data.months} series={[{ name: 'Expenses', values: data.data.totals, color: '#eb6834' }]} format={(v) => money(v)} />
                    </Panel>
                    <div className="panel_s overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    {data.data.months.map((m) => (
                                        <th key={m} className="text-right">
                                            {m}
                                        </th>
                                    ))}
                                    <th className="text-right">Year ({year})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.categories.map((c) => (
                                    <tr key={c.category}>
                                        <td className="font-medium">{c.category}</td>
                                        {c.months.map((v, i) => (
                                            <td key={i} className="whitespace-nowrap text-right">
                                                {v ? money(v) : '-'}
                                            </td>
                                        ))}
                                        <td className="whitespace-nowrap text-right font-semibold">{money(sum(c.months))}</td>
                                    </tr>
                                ))}
                                {data.data.categories.length === 0 && (
                                    <tr>
                                        <td colSpan={14} className="text-center text-gray-500">
                                            No expenses in {year}.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 font-semibold">
                                    <td>Total</td>
                                    {data.data.totals.map((v, i) => (
                                        <td key={i} className="whitespace-nowrap text-right">
                                            {money(v)}
                                        </td>
                                    ))}
                                    <td className="whitespace-nowrap text-right">{money(sum(data.data.totals))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </>
            )}
        </ReportPage>
    );
}
