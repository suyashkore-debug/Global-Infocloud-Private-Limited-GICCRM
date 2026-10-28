import { useState } from 'react';
import { Download } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { BarChart, BarList, type Series } from '../../components/charts/BarChart';
import { Button, ErrorNote, Select, Spinner } from '../../components/ui';
import { downloadCsv, Panel, ReportPage, usePeriod, useYear } from './shared';

type ReportType = 'invoices' | 'items' | 'payments' | 'customers' | 'credit_notes' | 'proposals' | 'estimates';
type Column = { key: string; label: string; kind?: 'money' | 'date' | 'number' };
type Row = Record<string, string | number | null>;

const REPORTS: { id: ReportType; label: string; status?: boolean; agent?: boolean }[] = [
    { id: 'invoices', label: 'Invoices Report', status: true, agent: true },
    { id: 'items', label: 'Items Report', agent: true },
    { id: 'payments', label: 'Payments Received' },
    { id: 'credit_notes', label: 'Credit Notes', status: true },
    { id: 'proposals', label: 'Proposals Report', status: true, agent: true },
    { id: 'estimates', label: 'Estimates Report', status: true, agent: true },
    { id: 'customers', label: 'Customers Report' },
];

const COLUMNS: Record<ReportType, Column[]> = {
    invoices: [
        { key: 'number', label: 'Invoice #' },
        { key: 'customer', label: 'Customer' },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'due_date', label: 'Due Date', kind: 'date' },
        { key: 'subtotal', label: 'Subtotal', kind: 'money' },
        { key: 'total', label: 'Total', kind: 'money' },
        { key: 'total_tax', label: 'Total Tax', kind: 'money' },
        { key: 'discount', label: 'Discount', kind: 'money' },
        { key: 'adjustment', label: 'Adjustment', kind: 'money' },
        { key: 'credits', label: 'Applied Credits', kind: 'money' },
        { key: 'due', label: 'Amount Open', kind: 'money' },
        { key: 'status', label: 'Status' },
    ],
    items: [
        { key: 'item', label: 'Item' },
        { key: 'quantity_sold', label: 'Quantity Sold', kind: 'number' },
        { key: 'total_amount', label: 'Total Amount', kind: 'money' },
        { key: 'average_price', label: 'Average Price', kind: 'money' },
    ],
    payments: [
        { key: 'id', label: 'Payment #' },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'invoice', label: 'Invoice #' },
        { key: 'customer', label: 'Customer' },
        { key: 'payment_mode', label: 'Payment Mode' },
        { key: 'transaction_id', label: 'Transaction ID' },
        { key: 'amount', label: 'Amount', kind: 'money' },
    ],
    credit_notes: [
        { key: 'number', label: 'Credit Note #' },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'customer', label: 'Customer' },
        { key: 'subtotal', label: 'Subtotal', kind: 'money' },
        { key: 'total', label: 'Total', kind: 'money' },
        { key: 'total_tax', label: 'Total Tax', kind: 'money' },
        { key: 'remaining', label: 'Remaining Amount', kind: 'money' },
        { key: 'status', label: 'Status' },
    ],
    proposals: [
        { key: 'number', label: 'Proposal #' },
        { key: 'subject', label: 'Subject' },
        { key: 'to', label: 'To' },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'open_till', label: 'Open Till', kind: 'date' },
        { key: 'subtotal', label: 'Subtotal', kind: 'money' },
        { key: 'total', label: 'Total', kind: 'money' },
        { key: 'total_tax', label: 'Total Tax', kind: 'money' },
        { key: 'status', label: 'Status' },
    ],
    estimates: [
        { key: 'number', label: 'Estimate #' },
        { key: 'customer', label: 'Customer' },
        { key: 'invoiced', label: 'Invoice #' },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'expiry_date', label: 'Expiry Date', kind: 'date' },
        { key: 'subtotal', label: 'Subtotal', kind: 'money' },
        { key: 'total', label: 'Total', kind: 'money' },
        { key: 'total_tax', label: 'Total Tax', kind: 'money' },
        { key: 'status', label: 'Status' },
    ],
    customers: [
        { key: 'customer', label: 'Customer' },
        { key: 'invoices', label: 'Total Invoices', kind: 'number' },
        { key: 'total_tax', label: 'Total Tax', kind: 'money' },
        { key: 'total_amount', label: 'Amount', kind: 'money' },
    ],
};

function cell(row: Row, col: Column): string {
    const v = row[col.key];
    if (col.kind === 'money') {
        return money(v);
    }
    if (col.kind === 'date') {
        return v ? formatDate(String(v)) : '';
    }

    return v === null || v === undefined ? '' : String(v);
}

/** Perfex Reports > Sales: the report tables on the left, the yearly income charts. */
export default function SalesReportPage() {
    const [type, setType] = useState<ReportType>('invoices');
    const [status, setStatus] = useState('');
    const [agent, setAgent] = useState('');
    const [view, setView] = useState<'tables' | 'charts'>('tables');
    const staff = useStaff();
    const { period, picker } = usePeriod();
    const report = REPORTS.find((r) => r.id === type)!;
    const { data, loading, error } = useApi<{ data: Row[]; meta: { statuses: { id: number; name: string }[] } }>(view === 'tables' ? '/reports/sales' : null, {
        type,
        ...period,
        status: report.status ? status || undefined : undefined,
        sale_agent_id: report.agent ? agent || undefined : undefined,
    });
    const columns = COLUMNS[type];
    const rows = data?.data ?? [];

    return (
        <ReportPage
            title="Sales Reports"
            actions={
                <div className="flex rounded-md border border-gray-300 bg-white p-0.5 text-[13px]">
                    {(['tables', 'charts'] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setView(v)} className={`rounded px-3 py-1 ${view === v ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}>
                            {v === 'tables' ? 'Reports' : 'Charts'}
                        </button>
                    ))}
                </div>
            }
        >
            {view === 'charts' ? (
                <SalesCharts />
            ) : (
                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="panel_s self-start">
                        <ul className="py-1 text-[13px]">
                            {REPORTS.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => (setType(r.id), setStatus(''))}
                                        className={`w-full px-4 py-2 text-left ${type === r.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        {r.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <Panel>
                        <div className="flex flex-wrap items-center gap-2">
                            <h5 className="mr-auto text-[15px] font-semibold text-gray-800">{report.label}</h5>
                            {report.status && (
                                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
                                    <option value="">All statuses</option>
                                    {data?.meta.statuses.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            )}
                            {report.agent && (
                                <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-auto">
                                    <option value="">{type === 'proposals' ? 'Any assignee' : 'Any sale agent'}</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            )}
                            {picker}
                            <Button
                                variant="secondary"
                                disabled={!rows.length}
                                onClick={() => downloadCsv(`${type}-${period.from}-${period.to}`, columns.map((c) => c.label), rows.map((r) => columns.map((c) => r[c.key])))}
                            >
                                <Download className="h-4 w-4" /> Export
                            </Button>
                        </div>
                        <ErrorNote message={error} />
                        {loading && !data ? (
                            <Spinner />
                        ) : (
                            <div className="-mx-4 overflow-x-auto">
                                <table className="table-perfex">
                                    <thead>
                                        <tr>
                                            {columns.map((c) => (
                                                <th key={c.key} className={c.kind === 'money' || c.kind === 'number' ? 'text-right' : ''}>
                                                    {c.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => (
                                            <tr key={i}>
                                                {columns.map((c) => (
                                                    <td key={c.key} className={c.kind === 'money' || c.kind === 'number' ? 'whitespace-nowrap text-right' : c.kind === 'date' ? 'whitespace-nowrap' : ''}>
                                                        {cell(r, c)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        {rows.length === 0 && (
                                            <tr>
                                                <td colSpan={columns.length} className="text-center text-gray-500">
                                                    No entries found for this period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    {rows.length > 0 && (
                                        <tfoot>
                                            <tr className="bg-gray-50 font-semibold">
                                                {columns.map((c, ci) => (
                                                    <td key={c.key} className={c.kind === 'money' || c.kind === 'number' ? 'whitespace-nowrap text-right' : ''}>
                                                        {ci === 0
                                                            ? 'Total'
                                                            : c.kind === 'money'
                                                              ? money(rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0))
                                                              : c.kind === 'number'
                                                                ? rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0)
                                                                : ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        )}
                    </Panel>
                </div>
            )}
        </ReportPage>
    );
}

type ChartData = { months: string[]; total_income: number[]; payment_modes: Record<string, number[]>; customer_groups: Record<string, number> };

/** Perfex sales charts: total income by month, payment modes (stacked) and customer groups. */
function SalesCharts() {
    const { year, picker } = useYear();
    const { data } = useApi<{ data: ChartData }>('/reports/sales-charts', { year });

    if (!data) {
        return <Spinner />;
    }
    const d = data.data;
    // At most 8 series: the 7 largest payment modes, the rest folded into "Other".
    const modes = Object.entries(d.payment_modes).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0));
    const modeSeries: Series[] = modes.slice(0, 7).map(([name, values]) => ({ name, values }));
    if (modes.length > 7) {
        modeSeries.push({ name: 'Other', values: d.months.map((_, i) => modes.slice(7).reduce((s, [, v]) => s + v[i], 0)) });
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-[13px] text-gray-600">Year {picker}</div>
            <Panel title={`Total Income — ${money(d.total_income.reduce((a, b) => a + b, 0))}`}>
                <BarChart labels={d.months} series={[{ name: 'Income', values: d.total_income }]} format={(v) => money(v)} />
            </Panel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Payment Modes">
                    {modeSeries.length ? <BarChart labels={d.months} series={modeSeries} stacked format={(v) => money(v)} /> : <p className="text-[13px] text-gray-500">No payments in {year}.</p>}
                </Panel>
                <Panel title="Total Value by Customer Groups">
                    <BarList rows={Object.entries(d.customer_groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} format={(v) => money(v)} />
                </Panel>
            </div>
        </div>
    );
}
